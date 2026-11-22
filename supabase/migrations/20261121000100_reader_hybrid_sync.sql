begin;

-- The owner must explicitly reset the private reader data before transitioning.
lock table storage.objects in share row exclusive mode;
lock table public.reader_cloud_receipts, public.reader_cloud_values, public.reader_import_inbox in access exclusive mode;
do $$
begin
 if exists(select 1 from public.reader_cloud_receipts) or exists(select 1 from public.reader_cloud_values)
    or exists(select 1 from public.reader_import_inbox)
    or exists(select 1 from storage.objects where bucket_id='reader-epubs') then
  raise exception 'Reader protocol transition requires an explicitly authorized reader data reset';
 end if;
end $$;

alter table public.reader_cloud_values
 add column generation bigint not null default 0 check (generation >= 0),
 add check (case when key like '%/deleted' then generation=revision and value=to_jsonb(generation % 2=1)
                else generation % 2=0 end);
alter table public.reader_import_inbox
 add column generation bigint not null default 0 check (generation >= 0 and generation % 2 = 0),
 drop constraint reader_import_inbox_status_check,
 add check (status in ('uploading','queued','imported','duplicate','error','cancelled','retired'));
alter table public.reader_cloud_receipts
 drop column result,
 add column key text not null,
 add column accepted_revision bigint not null,
 add column generation bigint not null,
 add column request_hash bytea not null check (octet_length(request_hash)=32),
 add column accepted_value jsonb,
 add column redacted boolean not null default false,
 add check (not redacted or accepted_value is null);
create index reader_receipt_book on public.reader_cloud_receipts(user_id,(split_part(key,'/',1))) where accepted_value is not null;
revoke all on public.reader_cloud_receipts from public,anon,authenticated;
grant select(user_id,key,generation) on public.reader_cloud_values to service_role;

-- A deletion advances the marker to an odd generation. An explicit restoration
-- advances it again. Marker revisions never reset, including across reimports.
create function public.reader_storage_generation(p_name text, p_remove boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare owner_id uuid; book text; epoch bigint; marker bigint;
begin
 if p_name !~ '^[0-9a-f-]{36}/[0-9a-f]{64}/(0|[1-9][0-9]{0,15})[.]epub$' then return false; end if;
 owner_id:=split_part(p_name,'/',1)::uuid;
 if current_setting('role',true)='authenticated' and owner_id is distinct from auth.uid() then return false; end if;
 book:=split_part(p_name,'/',2);
 epoch:=split_part(split_part(p_name,'/',3),'.',1)::bigint;
 if epoch % 2 <> 0 then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,30));
 select generation into marker from public.reader_cloud_values where user_id=owner_id and key=book||'/deleted';
 if p_remove then return epoch < coalesce(marker,0); end if;
 return epoch=coalesce(marker,0) or (marker % 2=1 and epoch=marker+1
   and current_setting('role',true)='service_role');
end $$;
revoke all on function public.reader_storage_generation(text,boolean) from public,anon;
grant execute on function public.reader_storage_generation(text,boolean) to authenticated;

alter policy reader_epub_insert on storage.objects with check (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access()
 and public.reader_storage_generation(name,false));
alter policy reader_epub_delete on storage.objects using (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access()
 and public.reader_storage_generation(name,true));

-- Storage service-role uploads bypass RLS. Validate their path under the same
-- account lock as reader mutations before Storage commits its metadata.
create function public.reader_check_original_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='reader-epubs' and not coalesce(public.reader_storage_generation(new.name,false),false) then
  raise exception 'Reader EPUB generation changed' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.reader_check_original_insert() from public,anon,authenticated;
create trigger reader_check_original_insert before insert on storage.objects for each row
 when (new.bucket_id='reader-epubs') execute function public.reader_check_original_insert();

create function public.reader_check_delivery_generation() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,30));
 select coalesce((select generation from public.reader_cloud_values
   where user_id=new.user_id and key=new.hash||'/deleted'),0) into marker;
 if new.generation <> marker + marker % 2 then
  raise exception 'Reader EPUB generation changed' using errcode='40001';
 end if;
 return new;
end $$;
alter policy reader_inbox_result on public.reader_import_inbox using (
 user_id=(select auth.uid()) and public.reader_has_access() and status in ('queued','imported','duplicate','error','cancelled')
) with check (
 user_id=(select auth.uid()) and public.reader_has_access() and status in ('imported','duplicate','error','cancelled')
);
revoke all on function public.reader_check_delivery_generation() from public,anon,authenticated;
create trigger reader_check_delivery_generation before insert on public.reader_import_inbox for each row
 execute function public.reader_check_delivery_generation();

drop function public.reader_cloud_apply(uuid,text,jsonb,bigint);
create function public.reader_cloud_apply(p_id uuid,p_key text,p_value jsonb,p_base bigint,p_generation bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=auth.uid();
 book_id text:=split_part(p_key,'/',1);
 marker public.reader_cloud_values;
 current_row public.reader_cloud_values;
 receipt public.reader_cloud_receipts;
 submitted jsonb:=p_value;
 fingerprint bytea;
 epoch bigint;
 transition boolean;
 accepted jsonb;
 accepted_revision bigint;
begin
 if v_owner is null or not public.reader_has_access() then raise exception 'Reader cloud access has not been granted'; end if;
 if p_id is null or p_key is null or length(p_key) not between 1 and 200
   or p_value is null or octet_length(p_value::text)>2097152 or p_base is null or p_base<0
   or p_generation is null or p_generation<0 then raise exception 'Invalid reader change'; end if;
 transition:=p_key=book_id||'/deleted';
 if p_key like '%/deleted' and (not transition or book_id !~ '^[0-9a-f]{64}$' or p_value not in ('true'::jsonb,'false'::jsonb)) then
  raise exception 'Invalid EPUB deletion';
 end if;
 -- Bind the original request before the shared-state merge can change value/base.
 fingerprint:=sha256(convert_to(jsonb_build_array(p_key,p_value,p_base,p_generation)::text,'UTF8'));
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text,30));
 select * into receipt from public.reader_cloud_receipts where user_id=v_owner and id=p_id;
 if found then
  if receipt.request_hash<>fingerprint then raise exception 'Reader operation request mismatch' using errcode='22023'; end if;
  if not receipt.redacted then
   return jsonb_build_object('key',receipt.key,'revision',receipt.accepted_revision,
     'generation',receipt.generation,'value',coalesce(receipt.accepted_value,submitted));
  end if;
 end if;
 select * into marker from public.reader_cloud_values where user_id=v_owner and key=book_id||'/deleted';
 epoch:=coalesce(marker.generation,0);
 if receipt.redacted or p_generation<>epoch or
    (epoch % 2=1 and not (transition and p_value='false')) then
  return jsonb_build_object('stale',true,'key',book_id||'/deleted','value',coalesce(marker.value,'false'),
    'revision',coalesce(marker.revision,0),'generation',epoch);
 end if;
 select * into current_row from public.reader_cloud_values where user_id=v_owner and key=p_key;
 if transition and (p_base<>epoch or p_value=coalesce(marker.value,'false')) then
  return jsonb_build_object('conflict',true,'key',p_key,'value',coalesce(marker.value,'false'),
   'revision',epoch,'generation',epoch);
 end if;

 if p_base=0 and split_part(p_key,'/',2) in ('favorite','rec','progress','status') and exists(
   select 1 from public.reader_cloud_values m where m.user_id=v_owner and m.key=book_id||'/manifest' and m.value->>'workId' is not null) then
  p_value:=public.reader_initial_value(v_owner,(select m.value->>'workId' from public.reader_cloud_values m
    where m.user_id=v_owner and m.key=book_id||'/manifest'),split_part(p_key,'/',2),p_value);
  p_base:=coalesce(current_row.revision,0);
 end if;
 if coalesce(current_row.revision,0)<>p_base and current_row.value is distinct from p_value then
  return jsonb_build_object('conflict',true,'key',p_key,'value',current_row.value,
    'revision',coalesce(current_row.revision,0),'generation',epoch);
 end if;
 if transition and p_value='false' and exists(select 1 from storage.objects
    where bucket_id='reader-epubs' and name=v_owner::text||'/'||book_id||'/'||(epoch-1)::text||'.epub') then
  raise exception 'Retired EPUB removal must finish before restoration' using errcode='55000';
 end if;
 if transition then epoch:=epoch+1; end if;
 insert into public.reader_cloud_values(user_id,key,value,revision,generation)
 values(v_owner,p_key,p_value,coalesce(current_row.revision,0)+1,epoch)
 on conflict(user_id,key) do update set value=excluded.value,revision=excluded.revision,generation=excluded.generation
 returning value,revision into accepted,accepted_revision;
 if transition and p_value='true' then
  delete from public.reader_cloud_values where user_id=v_owner and starts_with(key,book_id||'/') and key<>p_key;
  -- Keep transfer IDs pinned so an old Calibre upload retry cannot restore the book.
  update public.reader_import_inbox set metadata='{}',status='retired',message='EPUB removed.'
   where user_id=v_owner and hash=book_id;
  -- Retain deduplication identities. Erase irreconstructible private payloads.
  update public.reader_cloud_receipts r set accepted_value=null,redacted=true
    where r.user_id=v_owner and split_part(r.key,'/',1)=book_id and starts_with(r.key,book_id||'/')
      and r.accepted_value is not null;
 end if;
 insert into public.reader_cloud_receipts(user_id,id,key,accepted_revision,generation,request_hash,accepted_value)
 values(v_owner,p_id,p_key,accepted_revision,epoch,fingerprint,
   case when accepted::text is distinct from submitted::text then accepted end);
 return jsonb_build_object('key',p_key,'value',accepted,'revision',accepted_revision,'generation',epoch);
end $$;
revoke all on function public.reader_cloud_apply(uuid,text,jsonb,bigint,bigint) from public,anon;
grant execute on function public.reader_cloud_apply(uuid,text,jsonb,bigint,bigint) to authenticated;

-- Preserve the existing shared-state publication and snapshot projections.
do $$
declare original text; updated text;
begin
 select pg_get_functiondef('public.reader_write_work_field(uuid,text,text,jsonb,text)'::regprocedure) into original;
 updated:=replace(original,$old$begin
 insert into public.reader_cloud_values(user_id,key,value)
  select owner_id,split_part(m.key,'/',1)||'/'||field,incoming$old$,$new$begin
 if not pg_try_advisory_xact_lock(hashtextextended(owner_id::text,30)) then
  raise exception 'Reader state changed concurrently. Retry the organizer save.' using errcode='40001';
 end if;
 insert into public.reader_cloud_values(user_id,key,value,generation)
  select owner_id,split_part(m.key,'/',1)||'/'||field,incoming,m.generation$new$);
 if original=updated then raise exception 'Review reader shared generation update'; end if;
 execute updated;
 select pg_get_functiondef('public.reader_offline_snapshot()'::regprocedure) into original;
 updated:=replace(replace(original,$old$'id',split_part(m.key,'/',1),$old$,$new$'id',split_part(m.key,'/',1),'generation',m.generation,
   'favoriteRevision',coalesce(f.revision,0),'recRevision',coalesce(r.revision,0),$new$),
   $old$split_part(m.key,'/',1)||'.epub'$old$,$new$split_part(m.key,'/',1)||'/'||m.generation::text||'.epub'$new$);
 if original=updated or position('m.generation::text' in updated)=0 then raise exception 'Review reader snapshot generation update'; end if;
 execute updated;
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into original;
 updated:=replace(original,$old$ perform pg_advisory_xact_lock(hashtextextended(device.user_id::text || ':' || p_work::text,0));$old$,
 $new$ if p_action in ('save','progress') and (p_input ? 'readerBook'
    or exists(select 1 from public.reader_organizer_devices rd where rd.device=device.id)) then
  if coalesce(p_input->>'readerBook','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_input->>'readerGeneration','') !~ '^(0|[1-9][0-9]{0,15})$' then
   raise exception 'Missing reader EPUB generation' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(device.user_id::text,30));
  if (p_input->>'readerGeneration')::bigint % 2<>0 or (p_input->>'readerGeneration')::bigint <>
     coalesce((select generation from public.reader_cloud_values where user_id=device.user_id
         and key=(p_input->>'readerBook')||'/deleted'),0) then
   raise exception 'Reader EPUB generation changed' using errcode='40001';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(device.user_id::text || ':' || p_work::text,0));$new$);
 if original=updated then raise exception 'Review reader companion generation update'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
