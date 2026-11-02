begin;
create index reader_cloud_work_identity_idx on public.reader_cloud_values(user_id,(value->>'workId')) where key like '%/manifest';
-- First association takes the furthest saved state. Subsequent edits may deliberately
-- lower progress, restart a reread, or remove a personal marking.
create function public.reader_status_rank(value text) returns integer language sql immutable set search_path='' as $$
 select case value when 'finished' then 6 when 'waiting_for_updates' then 5 when 'did_not_finish' then 4 when 'paused_reading' then 3 when 're_reading' then 2 when 'reading' then 1 else 0 end
$$;
create function public.reader_initial_value(owner_id uuid, work text, field text, incoming jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidate jsonb; result jsonb:=incoming;
begin
 for candidate in
  select v.value from public.reader_cloud_values m join public.reader_cloud_values v
   on v.user_id=m.user_id and v.key=split_part(m.key,'/',1)||'/'||field
   where m.user_id=owner_id and m.key like '%/manifest' and m.value->>'workId'=work
   and not exists(select 1 from public.reader_cloud_values d where d.user_id=m.user_id and d.key=split_part(m.key,'/',1)||'/deleted' and d.value='true')
  union all
  select to_jsonb(jsonb_array_length(v.value)) from public.reader_cloud_values m join public.reader_cloud_values v
   on v.user_id=m.user_id and v.key=split_part(m.key,'/',1)||'/completed'
   where field='progress' and m.user_id=owner_id and m.key like '%/manifest' and m.value->>'workId'=work and jsonb_typeof(v.value)='array'
    and not exists(select 1 from public.reader_cloud_values p where p.user_id=v.user_id and p.key=split_part(v.key,'/',1)||'/progress')
    and not exists(select 1 from public.reader_cloud_values d where d.user_id=m.user_id and d.key=split_part(m.key,'/',1)||'/deleted' and d.value='true')
  union all
  select case field when 'progress' then to_jsonb(e.last_read_chapter) when 'status' then to_jsonb(e.reading_status) when 'favorite' then to_jsonb(e.is_favorite) when 'rec' then to_jsonb(e.is_rec) end
   from public.library_entries e join public.works w on w.id=e.work_id
   where e.user_id=owner_id and w.ao3_work_id::text=work
    and exists(select 1 from public.reader_organizer_links l where l.user_id=owner_id)
 loop
  if field='progress' and jsonb_typeof(candidate)='number' and (candidate::text)::numeric > (result::text)::numeric then result:=candidate;
  elsif field='status' and public.reader_status_rank(candidate#>>'{}')>public.reader_status_rank(result#>>'{}') then result:=candidate;
  elsif field in ('favorite','rec') and candidate='true' then result:='true'; end if;
 end loop;
 return result;
end $$;
revoke all on function public.reader_initial_value(uuid,text,text,jsonb) from public,anon,authenticated;

create function public.reader_prepare_shared_value() returns trigger language plpgsql security definer set search_path='' as $$
declare work text; field text:=split_part(new.key,'/',2);
begin
 if pg_trigger_depth()>1 or field not in ('favorite','rec','progress','status') then return new; end if;
 if field in ('favorite','rec') and jsonb_typeof(new.value) is distinct from 'boolean' then raise exception 'Invalid reader marking'; end if;
 if field='progress' and (jsonb_typeof(new.value) is distinct from 'number' or new.value::text !~ '^[0-9]{1,9}$') then raise exception 'Invalid reader progress'; end if;
 if field='status' and (jsonb_typeof(new.value) is distinct from 'string' or new.value#>>'{}' not in ('to_read','reading','paused_reading','waiting_for_updates','re_reading','finished','did_not_finish')) then raise exception 'Invalid reading status'; end if;
 select m.value->>'workId' into work from public.reader_cloud_values m where m.user_id=new.user_id and m.key=split_part(new.key,'/',1)||'/manifest';
 if work is null then return new; end if;
 -- INSERT ... ON CONFLICT invokes the insert trigger even for an existing key.
 if not exists(select 1 from public.reader_cloud_values v where v.user_id=new.user_id and v.key=new.key) then
  new.value:=public.reader_initial_value(new.user_id,work,field,new.value);
 end if;
 return new;
end $$;
create trigger reader_prepare_shared_value before insert or update on public.reader_cloud_values for each row execute function public.reader_prepare_shared_value();

-- One publication path is used by both sides of the bridge and association repair.
create function public.reader_write_work_field(owner_id uuid, work text, field text, incoming jsonb, source_key text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.reader_cloud_values(user_id,key,value)
  select owner_id,split_part(m.key,'/',1)||'/'||field,incoming from public.reader_cloud_values m
  where m.user_id=owner_id and m.key like '%/manifest' and m.value->>'workId'=work
   and (source_key is null or split_part(m.key,'/',1)||'/'||field<>source_key)
   and not exists(select 1 from public.reader_cloud_values d where d.user_id=m.user_id and d.key=split_part(m.key,'/',1)||'/deleted' and d.value='true')
 on conflict(user_id,key) do update set value=excluded.value,revision=public.reader_cloud_values.revision+1 where public.reader_cloud_values.value is distinct from excluded.value;
 if exists(select 1 from public.reader_organizer_links l where l.user_id=owner_id) then
  update public.library_entries e set
   is_favorite=case when field='favorite' then (incoming::text)::boolean else e.is_favorite end,
   is_rec=case when field='rec' then (incoming::text)::boolean else e.is_rec end,
   last_read_chapter=case when field='progress' then (incoming::text)::integer else e.last_read_chapter end,
   reading_status=case when field='status' then (incoming#>>'{}')::public.reading_status else e.reading_status end
  from public.works w where w.id=e.work_id and e.user_id=owner_id and w.ao3_work_id::text=work
   and (case field when 'favorite' then to_jsonb(e.is_favorite) when 'rec' then to_jsonb(e.is_rec) when 'progress' then to_jsonb(e.last_read_chapter) when 'status' then to_jsonb(e.reading_status) end) is distinct from incoming;
 end if;
end $$;
revoke all on function public.reader_write_work_field(uuid,text,text,jsonb,text) from public,anon,authenticated;
create function public.reader_share_cloud_value() returns trigger language plpgsql security definer set search_path='' as $$
declare work text; field text:=split_part(new.key,'/',2); initial jsonb; merged jsonb;
begin
 if pg_trigger_depth()>1 then return new; end if;
 if field='manifest' and new.value->>'workId' is not null then
  if tg_op='UPDATE' and old.value->>'workId' is not distinct from new.value->>'workId' then return new; end if;
  for field,initial in select * from jsonb_each('{"progress":0,"status":"to_read","favorite":false,"rec":false}'::jsonb) loop
   merged:=public.reader_initial_value(new.user_id,new.value->>'workId',field,initial);
   perform public.reader_write_work_field(new.user_id,new.value->>'workId',field,merged);
  end loop;
  return new;
 end if;
 if field not in ('favorite','rec','progress','status') then return new; end if;
 select m.value->>'workId' into work from public.reader_cloud_values m where m.user_id=new.user_id and m.key=split_part(new.key,'/',1)||'/manifest';
 if work is not null then perform public.reader_write_work_field(new.user_id,work,field,new.value,new.key); end if;
 return new;
end $$;
create trigger reader_share_cloud_value after insert or update on public.reader_cloud_values for each row execute function public.reader_share_cloud_value();

create function public.reader_prepare_organizer_state() returns trigger language plpgsql security definer set search_path='' as $$
declare work text; marker text:='bta.reader_import_'||replace(new.id::text,'-','');
begin
 if tg_op='UPDATE' and coalesce(current_setting(marker,true),'')<>'true' then return new; end if;
 if not exists(select 1 from public.reader_organizer_links l where l.user_id=new.user_id) then return new; end if;
 select w.ao3_work_id::text into work from public.works w where w.id=new.work_id;
 if work is null then return new; end if;
 -- Importers may fill status/progress in several statements after INSERT.
 -- Protect the initial maximum through this transaction only; later corrections remain explicit.
 if tg_op='INSERT' then perform set_config(marker,'true',true); end if;
 new.last_read_chapter:=(public.reader_initial_value(new.user_id,work,'progress',to_jsonb(new.last_read_chapter))::text)::integer;
 new.reading_status:=(public.reader_initial_value(new.user_id,work,'status',to_jsonb(new.reading_status))#>>'{}')::public.reading_status;
 new.is_favorite:=(public.reader_initial_value(new.user_id,work,'favorite',to_jsonb(new.is_favorite))::text)::boolean;
 new.is_rec:=(public.reader_initial_value(new.user_id,work,'rec',to_jsonb(new.is_rec))::text)::boolean;
 return new;
end $$;
create trigger reader_prepare_organizer_state before insert or update on public.library_entries for each row execute function public.reader_prepare_organizer_state();
create function public.reader_share_organizer_state() returns trigger language plpgsql security definer set search_path='' as $$
declare work text; field text; incoming jsonb;
begin
 if pg_trigger_depth()>1 or not exists(select 1 from public.reader_organizer_links l where l.user_id=new.user_id) then return new; end if;
 select w.ao3_work_id::text into work from public.works w where w.id=new.work_id;
 if work is null then return new; end if;
 for field,incoming in select * from jsonb_each(jsonb_build_object('favorite',new.is_favorite,'rec',new.is_rec,'progress',new.last_read_chapter,'status',new.reading_status)) loop
  if tg_op='UPDATE' then
   if field='favorite' and new.is_favorite=old.is_favorite then continue; end if;
   if field='rec' and new.is_rec=old.is_rec then continue; end if;
   if field='progress' and new.last_read_chapter=old.last_read_chapter then continue; end if;
   if field='status' and new.reading_status=old.reading_status then continue; end if;
  end if;
  perform public.reader_write_work_field(new.user_id,work,field,incoming);
 end loop;
 return new;
end $$;
create trigger reader_share_organizer_state after insert or update of reading_status,last_read_chapter,is_favorite,is_rec on public.library_entries for each row execute function public.reader_share_organizer_state();

-- Enabling the account link reconciles books imported before connecting either app.
create function public.reader_reconcile_account(owner_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare work text; field text; initial jsonb; merged jsonb;
begin
 for work in select distinct m.value->>'workId' from public.reader_cloud_values m where m.user_id=owner_id and m.key like '%/manifest' and m.value->>'workId' is not null loop
  for field,initial in select * from jsonb_each('{"progress":0,"status":"to_read","favorite":false,"rec":false}'::jsonb) loop
   merged:=public.reader_initial_value(owner_id,work,field,initial);
   perform public.reader_write_work_field(owner_id,work,field,merged);
  end loop;
 end loop;
end $$;
revoke all on function public.reader_reconcile_account(uuid) from public,anon,authenticated;
create function public.reader_connect_shared_state() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.reader_reconcile_account(new.user_id); return new; end $$;
create trigger reader_connect_shared_state after insert on public.reader_organizer_links for each row execute function public.reader_connect_shared_state();

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.reader_cloud_apply(uuid,text,jsonb,bigint)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if coalesce(current_row.revision,0) <> p_base$old$,$new$ if p_base=0 and split_part(p_key,'/',2) in ('favorite','rec','progress','status') and exists(
  select 1 from public.reader_cloud_values m where m.user_id=owner_id and m.key=split_part(p_key,'/',1)||'/manifest' and m.value->>'workId' is not null) then
  p_value:=public.reader_initial_value(owner_id,(select m.value->>'workId' from public.reader_cloud_values m where m.user_id=owner_id and m.key=split_part(p_key,'/',1)||'/manifest'),split_part(p_key,'/',2),p_value);
  p_base:=coalesce(current_row.revision,0);
 end if;
 if coalesce(current_row.revision,0) <> p_base$new$);
 if updated=definition then raise exception 'Review initial reader association merge'; end if;
 execute updated;
end $migration$;

-- Verified shared progress can exceed the chapter count in an older imported
-- metadata snapshot; keep the normal validation for unsupported manual progress.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition,$old$or new.last_read_chapter > published or new.last_read_chapter > total$old$,$new$or ((new.last_read_chapter > published or new.last_read_chapter > total) and not (
  exists(select 1 from public.reader_organizer_links l where l.user_id=new.user_id)
  and (public.reader_initial_value(new.user_id,(select w.ao3_work_id::text from public.works w where w.id=new.work_id),'progress','0')::text)::integer >= new.last_read_chapter))$new$);
 if updated=definition then raise exception 'Review shared-progress validation'; end if;
 execute updated;
end $migration$;

-- The trigger can consult the private shared-state helper for owner-scoped rows.
-- It retains its empty search path and cannot be called directly by app roles.
alter function public.validate_manual_entry() security definer;

-- Include cloud markings in the retained organizer snapshot.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.reader_offline_snapshot()'::regprocedure) into definition;
 updated:=replace(definition,$old$'notes',coalesce(n.value,'""'::jsonb),$old$,$new$'notes',coalesce(n.value,'""'::jsonb),'favorite',coalesce(f.value,'false'::jsonb),'rec',coalesce(r.value,'false'::jsonb),$new$);
 updated:=replace(updated,$old$ left join public.reader_cloud_values n on$old$,$new$ left join public.reader_cloud_values f on f.user_id=m.user_id and f.key=split_part(m.key,'/',1)||'/favorite'
 left join public.reader_cloud_values r on r.user_id=m.user_id and r.key=split_part(m.key,'/',1)||'/rec'
 left join public.reader_cloud_values n on$new$);
 if updated=definition then raise exception 'Review offline snapshot markings'; end if;
 execute updated;
end $migration$;
-- Existing linked libraries receive the same first-association reconciliation.
do $$ declare owner_id uuid; begin
 for owner_id in select l.user_id from public.reader_organizer_links l loop perform public.reader_reconcile_account(owner_id); end loop;
end $$;

commit;
