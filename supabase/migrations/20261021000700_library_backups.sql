begin;

-- Dependency order doubles as the restore allowlist. Credentials, worker leases,
-- queue fairness and the derived search index are deliberately not backed up.
create function public.library_backup_tables() returns text[]
language sql immutable set search_path='' as $$
 select array['works','authors','fandoms','tags','work_authors','work_fandoms','work_tags',
 'metadata_preferences','library_entries','collections','personal_tags','library_series',
 'collection_works','library_entry_tags','collection_series','import_batches','import_items',
 'metadata_jobs','processing_logs']::text[];
$$;

create function public.export_library_backup() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); t text; predicate text; rows jsonb; tables jsonb:='{}'; work_ids uuid[];
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select array_agg(work_id) into work_ids from (
  select work_id from public.library_entries where user_id=owner_id
  union select work_id from public.metadata_jobs where user_id=owner_id
 ) saved;
 foreach t in array public.library_backup_tables() loop
  predicate:=case
   when t='works' then 'r.id=any($2)'
   when t in ('work_authors','work_fandoms','work_tags') then 'r.work_id=any($2)'
   when t='authors' then 'exists(select 1 from public.work_authors l where l.author_id=r.id and l.work_id=any($2))'
   when t='fandoms' then 'exists(select 1 from public.work_fandoms l where l.fandom_id=r.id and l.work_id=any($2))'
   when t='tags' then 'exists(select 1 from public.work_tags l where l.tag_id=r.id and l.work_id=any($2))'
   else 'r.user_id=$1' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where %s',t,predicate)
   into rows using owner_id,work_ids;
  if t='metadata_jobs' then
   select coalesce(jsonb_agg(r||jsonb_build_object('lease_token',null,'lease_until',null)),'[]') into rows from jsonb_array_elements(rows) r;
  end if;
  tables:=tables||jsonb_build_object(t,rows);
 end loop;
 return jsonb_build_object('format','between-chapters-backup','version',1,'exported_at',now(),
  'user_id',owner_id,'tables',tables);
end;
$$;

-- Administrator-only, atomic restore. The target Auth account must already exist.
-- All foreign keys/check constraints stay enabled. User triggers are suspended
-- transactionally to preserve timestamps/history and avoid per-row reindexing.
create function public.restore_library_backup(p_backup jsonb,p_user uuid,p_replace boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text; row_data jsonb; rows jsonb; source_id uuid; target_id uuid;
 id_map jsonb:='{}'; data jsonb; assignments text; has_data boolean; ids uuid[]; uuid_columns text[];
begin
 if p_backup->>'format' is distinct from 'between-chapters-backup' or p_backup->>'version' is distinct from '1'
  or jsonb_typeof(p_backup->'tables') is distinct from 'object' then raise exception 'Unsupported backup format'; end if;
 source_id:=(p_backup->>'user_id')::uuid;
 if source_id is null or p_user is null or not exists(select 1 from auth.users where id=p_user) then
  raise exception 'Create the target Auth account before restoring'; end if;
 data:=p_backup->'tables';
 foreach t in array public.library_backup_tables() loop
  if jsonb_typeof(data->t) is distinct from 'array' then raise exception 'Missing backup table: %',t; end if;
  if exists(select 1 from jsonb_array_elements(data->t) r where jsonb_typeof(r)<>'object'
   or (r ? 'user_id' and r->>'user_id' is distinct from source_id::text)) then raise exception 'Invalid backup owner or row: %',t; end if;
  execute format('lock table public.%I in access exclusive mode',t);
 end loop;
 -- Check every private table, including settings/history and starter collections.
 foreach t in array (public.library_backup_tables())[8:19] loop
  execute format('select exists(select 1 from public.%I where user_id=$1)',t) into has_data using p_user;
  if has_data and not coalesce(p_replace,false) then raise exception 'Target has data; use replace explicitly'; end if;
 end loop;
 -- Map shared natural keys so a different project can already contain the same AO3 works/tags.
 foreach t in array array['works','authors','fandoms','tags'] loop
  for row_data in select value from jsonb_array_elements(data->t) loop
   target_id:=null;
   if t='works' then select id into target_id from public.works where ao3_work_id=(row_data->>'ao3_work_id')::bigint;
   elsif t='authors' then select id into target_id from public.authors where ao3_username=row_data->>'ao3_username';
   elsif t='fandoms' then select id into target_id from public.fandoms where name=row_data->>'name';
   else select id into target_id from public.tags where name=row_data->>'name' and category::text=row_data->>'category'; end if;
   id_map:=id_map||jsonb_build_object(row_data->>'id',coalesce(target_id,(row_data->>'id')::uuid));
  end loop;
 end loop;
 -- Private identities must not collide when restoring to another account.
 if source_id<>p_user then
  foreach t in array (public.library_backup_tables())[8:19] loop
   for row_data in select value from jsonb_array_elements(data->t) where value ? 'id' loop
    id_map:=id_map||jsonb_build_object(row_data->>'id',gen_random_uuid());
   end loop;
  end loop;
 end if;
 id_map:=id_map||jsonb_build_object(source_id::text,p_user);
 foreach t in array public.library_backup_tables() loop
  execute format('alter table public.%I disable trigger user',t);
 end loop;
 -- Delete in reverse dependency order; also clears queue turns via batch FK.
 for t in select name from unnest((public.library_backup_tables())[8:19]) with ordinality as items(name,position) order by position desc loop
  execute format('delete from public.%I where user_id=$1',t) using p_user;
 end loop;
 foreach t in array public.library_backup_tables() loop
  select array_agg(column_name::text) into uuid_columns from information_schema.columns
   where table_schema='public' and table_name=t and udt_name='uuid';
  select coalesce(jsonb_agg((select jsonb_object_agg(key,case when key=any(uuid_columns) and jsonb_typeof(value)='string'
   then coalesce(id_map->(value#>>'{}'),value) else value end) from jsonb_each(r))),'[]') into rows
   from jsonb_array_elements(data->t) r;
  -- Expired worker credentials cannot be resumed after a restore. Preserve history,
  -- return in-flight jobs to pending, and let normal claim fencing issue new leases.
  if t='metadata_jobs' then
   select coalesce(jsonb_agg(r||jsonb_build_object('lease_token',null,'lease_until',null)
    ||case when r->>'status'='processing' then jsonb_build_object('status','pending','attempts',least((r->>'attempts')::integer,3)) else '{}'::jsonb end),'[]')
    into rows from jsonb_array_elements(rows) r;
  elsif t='import_items' then
   select coalesce(jsonb_agg(r
    ||case when r->>'status'='processing' then jsonb_build_object('status','pending') else '{}'::jsonb end
    ||case when r->>'metadata_status'='processing' then jsonb_build_object('metadata_status','pending') else '{}'::jsonb end),'[]')
    into rows from jsonb_array_elements(rows) r;
  end if;
  if t in ('work_authors','work_fandoms','work_tags') then
   select array_agg((r->>'id')::uuid) into ids from jsonb_array_elements(data->'works') r;
   select array_agg(coalesce((id_map->>id::text)::uuid,id)) into ids from unnest(ids) id;
   execute format('delete from public.%I where work_id=any($1)',t) using ids;
  end if;
  if t in ('works','authors','fandoms','tags') then
   select string_agg(format('%I=excluded.%I',column_name,column_name),',') into assignments
    from information_schema.columns where table_schema='public' and table_name=t and column_name<>'id';
   execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1) on conflict(id) do update set %s',t,t,assignments) using rows;
  else
   execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',t,t) using rows;
  end if;
 end loop;
 foreach t in array public.library_backup_tables() loop
  execute format('alter table public.%I enable trigger user',t);
 end loop;
 -- Include other readers whose shared metadata was restored.
 perform public.refresh_library_documents(array(select id from public.library_entries));
 -- A completely emptied database also needs the worker's singleton gate.
 -- Never replace a live project's existing throttle/pause state.
 insert into public.metadata_worker_state(id) values(1) on conflict(id) do nothing;
 return id_map;
end;
$$;

revoke all on function public.library_backup_tables(),public.export_library_backup(),public.restore_library_backup(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.export_library_backup() to authenticated;
grant execute on function public.restore_library_backup(jsonb,uuid,boolean) to service_role;
commit;
