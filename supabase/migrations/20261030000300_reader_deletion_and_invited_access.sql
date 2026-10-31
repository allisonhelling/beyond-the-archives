-- Organizer accounts are provisioned by invitation (public and anonymous signup stay disabled).
-- Reuse those trusted Auth invitations/confirmed emails instead of requiring a second manual grant.
insert into public.reader_app_access(user_id)
select id from auth.users where not coalesce(is_anonymous,false) and (invited_at is not null or email_confirmed_at is not null)
on conflict do nothing;
create function public.grant_invited_reader_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(new.is_anonymous,false) and (new.invited_at is not null or new.email_confirmed_at is not null) then
  insert into public.reader_app_access(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.grant_invited_reader_access() from public,anon,authenticated;
create trigger grant_invited_reader_access after insert or update of invited_at,email_confirmed_at,is_anonymous on auth.users
for each row execute function public.grant_invited_reader_access();

create or replace function public.reader_cloud_apply(p_id uuid, p_key text, p_value jsonb, p_base bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.reader_cloud_values; result jsonb; book_id text := split_part(p_key,'/',1); deleted public.reader_cloud_values;
begin
 if owner_id is null or not public.reader_has_access() then raise exception 'Reader cloud access has not been granted'; end if;
 if p_id is null or p_key is null or length(p_key) not between 1 and 200 or p_value is null or octet_length(p_value::text) > 2097152 or p_base is null or p_base < 0 then raise exception 'Invalid reader change'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 30));
 select r.result into result from public.reader_cloud_receipts r where r.user_id = owner_id and r.id = p_id;
 if found then return result; end if;
 select * into deleted from public.reader_cloud_values where user_id = owner_id and key = book_id || '/deleted';
 -- Stale devices cannot recreate deleted reading data. Restoration is an explicit import.
 if deleted.value = 'true'::jsonb and not (p_key = deleted.key and p_value = 'false'::jsonb and p_base = deleted.revision) then
  return jsonb_build_object('key',deleted.key,'value',deleted.value,'revision',deleted.revision);
 end if;
 if p_key like '%/deleted' and (book_id !~ '^[0-9a-f]{64}$' or p_value not in ('true'::jsonb,'false'::jsonb)) then raise exception 'Invalid EPUB deletion'; end if;
 select * into current_row from public.reader_cloud_values where user_id = owner_id and key = p_key;
 if coalesce(current_row.revision,0) <> p_base and current_row.value is distinct from p_value then
  return jsonb_build_object('conflict',true,'key',p_key,'value',current_row.value,'revision',coalesce(current_row.revision,0));
 end if;
 insert into public.reader_cloud_values(user_id,key,value,revision) values(owner_id,p_key,p_value,coalesce(current_row.revision,0)+1)
 on conflict(user_id,key) do update set value=excluded.value, revision=excluded.revision
 returning jsonb_build_object('key',key,'value',value,'revision',revision) into result;
 if p_key = book_id || '/deleted' and p_value = 'true'::jsonb then
  delete from public.reader_cloud_values where user_id = owner_id and starts_with(key,book_id || '/') and key <> p_key;
  delete from public.reader_import_inbox where user_id = owner_id and hash = book_id;
  -- Receipts may contain notes/history. Retain only the deletion receipt for retry.
  delete from public.reader_cloud_receipts where user_id = owner_id and starts_with(reader_cloud_receipts.result->>'key',book_id || '/');
 end if;
 insert into public.reader_cloud_receipts values(owner_id,p_id,result);
 return result;
end $$;
-- Storage API performs physical deletion; SQL only records the durable tombstone.
create policy reader_epub_delete on storage.objects for delete to authenticated using (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access());
alter policy reader_epub_insert on storage.objects with check (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access()
 and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.epub$'
 and not exists(select 1 from public.reader_cloud_values where user_id=(select auth.uid()) and key=split_part(split_part(name,'/',2),'.',1) || '/deleted' and value='true'::jsonb));
