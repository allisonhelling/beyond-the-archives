begin;

create function public.default_dnf_cleanup_settings() returns jsonb
language sql immutable set search_path='' as $$
 select '{"enabled":false,"hours":168,"protect_favorites":true,"protect_personal":true,"protect_collections":true}'::jsonb;
$$;

-- Preferences use the existing private, backed-up account settings row.
alter table public.metadata_preferences add column dnf_cleanup jsonb not null default public.default_dnf_cleanup_settings();

create function public.check_dnf_cleanup(p_settings jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_settings) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_settings))<>5
  or jsonb_typeof(p_settings->'enabled') is distinct from 'boolean'
  or jsonb_typeof(p_settings->'protect_favorites') is distinct from 'boolean'
  or jsonb_typeof(p_settings->'protect_personal') is distinct from 'boolean'
  or jsonb_typeof(p_settings->'protect_collections') is distinct from 'boolean'
  or jsonb_typeof(p_settings->'hours') is distinct from 'number'
  or (p_settings->>'hours')::numeric<>trunc((p_settings->>'hours')::numeric)
  or (p_settings->>'hours')::numeric not between 24 and 87600 then
  raise exception 'Choose a whole duration from 24 hours to 3650 days' using errcode='22023';
 end if;
end;
$$;
create function public.validate_dnf_cleanup() returns trigger
language plpgsql set search_path='' as $$
begin perform public.check_dnf_cleanup(new.dnf_cleanup); return new; end;
$$;
create trigger validate_dnf_cleanup before insert or update on public.metadata_preferences
 for each row execute function public.validate_dnf_cleanup();

alter table public.library_entries add column dnf_since timestamptz;
-- Only a recorded transition establishes a historical DNF date. Older baseline
-- events are not evidence of when the reader actually stopped reading.
alter table public.library_entries disable trigger set_updated_at;
update public.library_entries e set dnf_since=coalesce((select (v->>'at')::timestamptz
 from jsonb_array_elements(e.reading_history) with ordinality h(v,n)
 where v->>'status'='did_not_finish' and v->>'action'='status' order by n desc limit 1),now())
 where reading_status='did_not_finish';
alter table public.library_entries enable trigger set_updated_at;
create function public.track_dnf_since() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.reading_status<>'did_not_finish' then new.dnf_since:=null;
 elsif TG_OP='INSERT' then new.dnf_since:=now();
 elsif old.reading_status<>'did_not_finish' then new.dnf_since:=now();
 else new.dnf_since:=old.dnf_since; end if;
 return new;
end;
$$;
create trigger zz_dnf_since before insert or update on public.library_entries
 for each row execute function public.track_dnf_since();
create index library_dnf_cleanup_idx on public.library_entries(user_id,dnf_since)
 where reading_status='did_not_finish';

-- No FK to an entry or shared work: this record must survive their deletion.
-- The original entry UUID identifies this reading lifecycle and makes retries safe.
create table public.reading_records (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 ao3_work_id bigint,
 original_url text not null,
 bookmark_id text,
 reading_status public.reading_status not null,
 last_read_chapter integer not null check(last_read_chapter>=0),
 created_at timestamptz not null,
 started_at timestamptz,
 finished_at timestamptz,
 dnf_since timestamptz,
 archived_at timestamptz not null default now(),
 reading_history jsonb not null check(jsonb_typeof(reading_history)='array'),
 metadata jsonb not null check(jsonb_typeof(metadata)='object'),
 format_version integer not null default 1 check(format_version=1)
);
alter table public.reading_records enable row level security;
alter table public.reading_records force row level security;
create policy own_reading_records on public.reading_records for select to authenticated using(user_id=(select auth.uid()));
grant select on public.reading_records to authenticated;
create index reading_records_owner_date on public.reading_records(user_id,archived_at desc,id);
create index reading_records_work on public.reading_records(user_id,ao3_work_id);
create index reading_records_bookmark on public.reading_records(user_id,bookmark_id);

-- Both active and archived statistics use this compact projection. It deliberately
-- contains no summaries, chapter maps, notes, collections, or complete tag lists.
create function public.compact_reading_record(s jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',s->'id','user_id',s->'user_id',
  'ao3_work_id',s->'work'->'ao3_work_id','original_url',s->'original_url',
  'bookmark_id',s->'source_bookmark'->'id','reading_status',s->'reading_status',
  'last_read_chapter',s->'last_read_chapter','created_at',s->'created_at',
  'started_at',s->'started_at','finished_at',s->'finished_at','dnf_since',s->'dnf_since',
  'reading_history',coalesce(s->'reading_history','[]'::jsonb),'format_version',1,
  'metadata',jsonb_build_object('title',s->'metadata'->'title','authors',s->'metadata'->'authors',
   'fandoms',s->'metadata'->'fandoms','language',coalesce(s->'metadata'->'language',s->'work'->'language'),
   'rating',s->'metadata'->'rating','word_count',s->'metadata'->'word_count',
   'published_chapters',s->'metadata'->'published_chapters'));
$$;
create view public.reading_activity with (security_invoker=true) as
 select d.id,d.user_id,public.compact_reading_record(d.story)||jsonb_build_object('archived_at',null) record
 from public.library_search_documents d
 union all
 select r.id,r.user_id,to_jsonb(r) record from public.reading_records r
 where not exists(select 1 from public.library_entries e where e.id=r.id);
grant select on public.reading_activity to authenticated;

create function public.dnf_cleanup_candidates(p_user uuid,p_settings jsonb)
returns table(id uuid,story jsonb,eligible_at timestamptz,protected boolean)
language sql stable set search_path='' as $$
 select e.id,d.story,e.dnf_since+make_interval(hours=>(p_settings->>'hours')::integer),
  ((p_settings->>'protect_favorites')::boolean and (e.is_favorite or e.is_rec))
  or ((p_settings->>'protect_personal')::boolean and (trim(e.notes)<>'' or e.personal_rating is not null
   or exists(select 1 from public.library_entry_tags t where t.library_entry_id=e.id)))
  or ((p_settings->>'protect_collections')::boolean and exists(select 1 from public.collection_works cw
   join public.collections c on c.id=cw.collection_id where cw.library_entry_id=e.id
   and c.default_key is null and c.automatic_rules is null))
  or exists(select 1 from public.metadata_jobs j where j.entry_id=e.id and j.status in ('pending','processing'))
 from public.library_entries e join public.library_search_documents d on d.id=e.id
 where e.user_id=p_user and e.reading_status='did_not_finish' and e.dnf_since is not null;
$$;

-- Shared by manual and scheduled execution; settings and eligibility are checked
-- under locks. A failed insert or delete rolls back the complete batch.
create function public.run_dnf_cleanup(p_user uuid,p_manual boolean default false,p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path='' as $$
declare settings jsonb; candidate record; snapshot jsonb; removed integer:=0;
begin
 select dnf_cleanup into settings from public.metadata_preferences where user_id=p_user for update;
 if settings is null then
  if not p_manual then return 0; end if;
  settings:=public.default_dnf_cleanup_settings();
 end if;
 if not p_manual and not (settings->>'enabled')::boolean then return 0; end if;
 for candidate in select e.id from public.library_entries e
  join public.dnf_cleanup_candidates(p_user,settings) c on c.id=e.id
  where not c.protected and c.eligible_at<=now() and (p_ids is null or e.id=any(p_ids))
  order by e.dnf_since,e.id limit 100 for update of e skip locked loop
  select public.compact_reading_record(c.story)||jsonb_build_object('archived_at',now()) into snapshot
   from public.dnf_cleanup_candidates(p_user,settings) c where c.id=candidate.id and not c.protected and c.eligible_at<=now();
  if snapshot is null then continue; end if;
  insert into public.reading_records select * from jsonb_populate_record(null::public.reading_records,snapshot);
  delete from public.library_entries where id=candidate.id and user_id=p_user;
  removed:=removed+1;
 end loop;
 return removed;
end;
$$;

create function public.dnf_cleanup(p_action text default 'get',p_input jsonb default '{}'::jsonb,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); settings jsonb; defaults jsonb:=public.default_dnf_cleanup_settings();
 result jsonb; removed integer:=0; ids uuid[];
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_action not in ('get','save','preview','cleanup','archive') or p_page is null or p_page<0 or p_page>1000000 then raise exception 'Invalid cleanup request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':dnf-cleanup',0));
 select dnf_cleanup into settings from public.metadata_preferences where user_id=owner_id for update;
 settings:=coalesce(settings,defaults);
 if p_action='save' then
  perform public.check_dnf_cleanup(p_input->'settings');
  if p_input->'base' is distinct from settings then raise exception 'Cleanup settings changed. Reload before saving.' using errcode='40001'; end if;
  settings:=p_input->'settings';
  insert into public.metadata_preferences(user_id,dnf_cleanup) values(owner_id,settings)
   on conflict(user_id) do update set dnf_cleanup=excluded.dnf_cleanup;
 elsif p_action='cleanup' then
  if p_input->'settings' is distinct from settings then raise exception 'Cleanup settings changed. Preview again.' using errcode='40001'; end if;
  if jsonb_typeof(p_input->'entries') is distinct from 'array' or jsonb_array_length(p_input->'entries') not between 1 and 100 then raise exception 'Preview up to 100 entries before cleanup'; end if;
  perform e.id from public.library_entries e join jsonb_array_elements(p_input->'entries') v on e.id=(v->>'id')::uuid
   where e.user_id=owner_id order by e.id for update of e;
  -- Fence edits since preview, including changes that removed personal details.
  if exists(select 1 from jsonb_array_elements(p_input->'entries') v join public.library_entries e on e.id=(v->>'id')::uuid
   where e.user_id=owner_id and e.updated_at is distinct from (v->>'version')::timestamptz) then
   raise exception 'A fic changed. Preview cleanup again.' using errcode='40001'; end if;
  select array_agg((v->>'id')::uuid) into ids from jsonb_array_elements(p_input->'entries') v;
  removed:=public.run_dnf_cleanup(owner_id,true,ids);
 end if;
 if p_action='archive' then
  select jsonb_build_object('total',(select count(*) from public.reading_records where user_id=owner_id),
   'records',coalesce(jsonb_agg(to_jsonb(r) order by r.archived_at desc,r.id),'[]'::jsonb)) into result
   from (select * from public.reading_records where user_id=owner_id order by archived_at desc,id limit 25 offset p_page*25) r;
  return result;
 end if;
 select jsonb_build_object('eligible',count(*) filter(where not protected and eligible_at<=now()),
  'protected',count(*) filter(where protected),'waiting',count(*) filter(where not protected and eligible_at>now())) into result
 from public.dnf_cleanup_candidates(owner_id,settings);
 if p_action='preview' then
  result:=result||jsonb_build_object('entries',(select coalesce(jsonb_agg(jsonb_build_object('id',id,
   'version',story->'updated_at','title',story->'metadata'->'title','dnf_since',story->'dnf_since',
   'eligible_at',eligible_at) order by eligible_at,id),'[]'::jsonb)
   from (select * from public.dnf_cleanup_candidates(owner_id,settings) where not protected and eligible_at<=now() order by eligible_at,id limit 100) c));
 end if;
 return result||jsonb_build_object('settings',settings,'removed',removed);
end;
$$;

create function public.run_scheduled_dnf_cleanup() returns integer
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; removed integer:=0;
begin
 for owner_id in select user_id from public.metadata_preferences where dnf_cleanup->>'enabled'='true' loop
  removed:=removed+public.run_dnf_cleanup(owner_id);
 end loop;
 return removed;
end;
$$;

-- Routine listing imports keep archived outcomes. Explicit link/manual adds can
-- create a new reading lifecycle without modifying the previous archive.
create function public.is_archived_reading(p_user uuid,p_work text,p_bookmark text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.reading_records r where r.user_id=p_user
  and ((p_work is not null and r.ao3_work_id::text=p_work) or (p_bookmark is not null and r.bookmark_id=p_bookmark)))
 and not exists(select 1 from public.library_entries e join public.works w on w.id=e.work_id
  where e.user_id=p_user and ((p_work is not null and w.ao3_work_id::text=p_work)
   or (p_bookmark is not null and e.source_bookmark->>'id'=p_bookmark)));
$$;
alter function public.submit_ao3_csv_import(jsonb) rename to submit_ao3_csv_unarchived;
create function public.submit_ao3_csv_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare filtered jsonb; skipped integer; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>20000000 then raise exception 'Submit 1–2000 listing works'; end if;
 select coalesce(jsonb_agg(v),'[]'::jsonb) into filtered from jsonb_array_elements(p_rows) v
  where not public.is_archived_reading(auth.uid(),v->>'workId',v->>'bookmarkId');
 skipped:=jsonb_array_length(p_rows)-jsonb_array_length(filtered);
 if jsonb_array_length(filtered)=0 then return jsonb_build_object('batch',null,'imported',0,'kept',skipped,'archived',skipped); end if;
 result:=public.submit_ao3_csv_unarchived(filtered);
 return result||jsonb_build_object('kept',coalesce((result->>'kept')::integer,0)+skipped,'archived',skipped);
end;
$$;

-- Append to the existing backup allowlist. Older version-1 files have no archive;
-- normalize just that missing table and the new defaulted preferences column.
create or replace function public.library_backup_tables() returns text[]
language sql immutable set search_path='' as $$
 select array['works','authors','fandoms','tags','work_authors','work_fandoms','work_tags',
 'metadata_preferences','library_entries','collections','personal_tags','library_series',
 'collection_works','library_entry_tags','collection_series','import_batches','import_items',
 'metadata_jobs','processing_logs','reading_records']::text[];
$$;
create function public.normalize_reading_backup(p_backup jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when not (p_backup->'tables' ? 'reading_records')
  then jsonb_set(p_backup,'{tables,reading_records}','[]'::jsonb) else p_backup end;
$$;
do $migration$
declare signature text; definition text;
begin
 foreach signature in array array['public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)',
  'public.validate_account_backup(jsonb)','public.preview_library_restore(jsonb)',
  'public.restore_own_library_backup(jsonb,text,text)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  definition:=replace(definition,'[8:19]','[8:20]');
  definition:=regexp_replace(definition,E'begin\n',E'begin\n p_backup:=public.normalize_reading_backup(p_backup);\n','i');
  if signature like '%restore_library_backup_internal%' then
   definition:=replace(definition,'  -- Expired worker credentials', $hook$  if t='metadata_preferences' then
   select coalesce(jsonb_agg(r||jsonb_build_object('dnf_cleanup',coalesce(r->'dnf_cleanup',
    public.default_dnf_cleanup_settings()))),'[]')
    into rows from jsonb_array_elements(rows) r;
  end if;
  if t='library_entries' then
   select coalesce(jsonb_agg(r||jsonb_build_object('dnf_since',case when r->>'reading_status'='did_not_finish'
    then coalesce(nullif(r->'dnf_since','null'::jsonb),to_jsonb(now())) else 'null'::jsonb end)),'[]')
    into rows from jsonb_array_elements(rows) r;
  end if;
  -- Expired worker credentials$hook$);
  elsif signature like '%validate_account_backup%' then
   definition:=replace(definition,' for row_data in select value', $hook$ for row_data in select value from jsonb_array_elements(p_backup->'tables'->'metadata_preferences') loop
  perform public.check_dnf_cleanup(coalesce(row_data->'dnf_cleanup',
   public.default_dnf_cleanup_settings()));
 end loop;
 for row_data in select value$hook$);
  end if;
  execute definition;
 end loop;
end;
$migration$;

revoke all on function public.check_dnf_cleanup(jsonb),public.validate_dnf_cleanup(),public.track_dnf_since(),
 public.dnf_cleanup_candidates(uuid,jsonb),public.run_dnf_cleanup(uuid,boolean,uuid[]),
 public.run_scheduled_dnf_cleanup(),public.is_archived_reading(uuid,text,text),
 public.submit_ao3_csv_unarchived(jsonb),public.normalize_reading_backup(jsonb) from public,anon,authenticated;
revoke all on function public.compact_reading_record(jsonb),public.dnf_cleanup(text,jsonb,integer),public.submit_ao3_csv_import(jsonb) from public,anon;
grant execute on function public.compact_reading_record(jsonb),public.dnf_cleanup(text,jsonb,integer),public.submit_ao3_csv_import(jsonb) to authenticated;
grant execute on function public.run_scheduled_dnf_cleanup() to service_role;
-- Direct preference writes also run validation, with invoker permissions.
grant execute on function public.check_dnf_cleanup(jsonb) to authenticated,service_role;
select public.refresh_library_documents(array(select id from public.library_entries));
notify pgrst,'reload schema';
commit;
