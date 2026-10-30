begin;
-- Availability belongs to a paired installation, never to the organizer device.
create table public.reader_availability (
 device_id uuid not null references public.userscript_devices(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 installation_id uuid not null,
 primary key(device_id,installation_id),
 name text not null check(length(name) between 1 and 80),
 url text not null check(length(url) <= 2048),
 reported_at timestamptz not null default now(),
 works jsonb not null check(jsonb_typeof(works)='array' and jsonb_array_length(works)<=10000)
);
alter table public.reader_availability enable row level security;
alter table public.reader_availability force row level security;
revoke all on public.reader_availability from public,anon,authenticated;
grant select on public.reader_availability to authenticated;
create policy reader_availability_owner on public.reader_availability for select to authenticated using(user_id=(select auth.uid()));
create trigger sync_library_query_state after insert or update or delete on public.reader_availability for each row execute function public.sync_library_query_state();

create function public.reader_offline_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); ids uuid[];
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select array_agg(e.id) into ids from public.library_entries e join public.works w on w.id=e.work_id
 where e.user_id=owner_id and exists(select 1 from public.reader_availability r where r.user_id=owner_id and r.works ? w.ao3_work_id::text);
 return jsonb_build_object('readers',coalesce((select jsonb_agg(jsonb_build_object('id',installation_id,'name',name,'url',url,'reportedAt',reported_at,'works',works) order by name,device_id) from public.reader_availability where user_id=owner_id),'[]'::jsonb),
 'stories',public.library_story_details(coalesce(ids,'{}'::uuid[])));
end $$;
revoke all on function public.reader_offline_snapshot() from public,anon;
grant execute on function public.reader_offline_snapshot() to authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_action='disconnect' then$old$,$new$ if p_action='reader_report' then
  if jsonb_typeof(p_input->'works') is distinct from 'array' or jsonb_array_length(p_input->'works')>10000
   or exists(select 1 from jsonb_array_elements(p_input->'works') v where jsonb_typeof(v)<>'string' or (v #>> '{}') !~ '^[1-9][0-9]{0,15}$')
   or coalesce(p_input->>'url','') !~ '^https?://' then raise exception 'Invalid reader report' using errcode='22023'; end if;
  insert into public.reader_availability(device_id,user_id,installation_id,name,url,works)
   values(device.id,device.user_id,(p_input->>'installationId')::uuid,trim(p_input->>'name'),p_input->>'url',p_input->'works')
   on conflict(device_id,installation_id) do update set installation_id=excluded.installation_id,name=excluded.name,url=excluded.url,works=excluded.works,reported_at=now();
  return '{}'::jsonb;
 end if;
 if p_action='disconnect' then$new$);
 if updated=definition then raise exception 'Review reader report dispatch'; end if;
 definition:=updated;
 updated:=replace(updated,$old$ return jsonb_build_object('ratingInfo',$old$,$new$ if result is not null then
  result:=result||jsonb_build_object('publication',(select jsonb_build_object('metadata',d.story->'metadata','at',now()) from public.library_story_documents d where d.user_id=device.user_id and d.id=entry.id));
 end if;
 return jsonb_build_object('ratingInfo',$new$);
 if updated=definition then raise exception 'Review reader publication response'; end if;
 execute updated;
 select pg_get_functiondef('public.library_candidate_predicate(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ return predicate;$old$,$new$ if nullif(p_query->>'reader','') is not null then
  predicate:=predicate||$sql$ and exists(select 1 from public.reader_availability r join public.library_entries e on e.user_id=r.user_id join public.works w on w.id=e.work_id where r.user_id=$2 and r.installation_id::text=$1->>'reader' and e.id=d.id and r.works ? w.ao3_work_id::text)$sql$;
 end if;
 return predicate;$new$);
 if updated=definition then raise exception 'Review reader candidate predicate'; end if;
 execute updated;
 select pg_get_functiondef('public.library_query_has_series(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'begin','begin
 if nullif(p_query->>''reader'','''') is not null then return false; end if;');
 execute updated;
end $migration$;
commit;
