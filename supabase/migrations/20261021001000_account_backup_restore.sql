begin;

-- Extend the existing transactional restore engine. Keep the administrator API
-- intact; only the account wrapper can request the isolated mode.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.restore_library_backup(jsonb,uuid,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'FUNCTION public.restore_library_backup(', 'FUNCTION public.restore_library_backup_internal(');
 updated:=replace(updated,'p_replace boolean DEFAULT false)', 'p_replace boolean DEFAULT false, p_account_only boolean DEFAULT false)');
 updated:=replace(updated,'coalesce(target_id,(row_data->>''id'')::uuid)', 'coalesce(target_id,case when p_account_only then gen_random_uuid() else (row_data->>''id'')::uuid end)');
 updated:=replace(updated,'if source_id<>p_user then','if source_id<>p_user or p_account_only then');
 updated:=replace(updated,$old$if t in ('work_authors','work_fandoms','work_tags') then$old$, $new$if not p_account_only and t in ('work_authors','work_fandoms','work_tags') then$new$);
 updated:=replace(updated,$old$if t in ('works','authors','fandoms','tags') then$old$ || chr(10) || '   select string_agg',
 $replacement$if p_account_only and t='works' then
   -- Never accept public metadata from an uploaded file. Its effective metadata
   -- is carried in private extension fields by the backup reader instead.
   insert into public.works(id,ao3_work_id)
   select (r->>'id')::uuid,(r->>'ao3_work_id')::bigint from jsonb_array_elements(rows) r
   on conflict(id) do nothing;
  elsif p_account_only and t=any(array['authors','fandoms','tags','work_authors','work_fandoms','work_tags']) then
   continue;
  elsif t in ('works','authors','fandoms','tags') then
   select string_agg$replacement$);
 updated:=replace(updated,'array(select id from public.library_entries)', 'array(select id from public.library_entries where not p_account_only or user_id=p_user)');
 if updated=definition or position('p_account_only boolean' in updated)=0 or position('Never accept public metadata' in updated)=0 then
  raise exception 'Review account restore engine migration';
 end if;
 execute updated;
end;
$migration$;
revoke all on function public.restore_library_backup_internal(jsonb,uuid,boolean,boolean) from public,anon,authenticated,service_role;

create or replace function public.restore_library_backup(p_backup jsonb,p_user uuid,p_replace boolean default false) returns jsonb
language sql security definer set search_path='' set statement_timeout='60s' as $$
 select public.restore_library_backup_internal(p_backup,p_user,p_replace,false);
$$;

-- The trigger and restore-file validator share exactly the same rule checks.
do $migration$
declare body text;
begin
 select prosrc into body from pg_proc where oid='public.validate_automatic_collection_rules()'::regprocedure;
 body:=replace(replace(replace(body,'new.automatic_rules','p_rules'),'new.default_key','p_default_key'),'return new;','return;');
 execute format('create function public.check_automatic_collection_rules(p_rules jsonb,p_default_key text) returns void language plpgsql set search_path=%L as %L','',body);
end;
$migration$;
create or replace function public.validate_automatic_collection_rules() returns trigger
language plpgsql set search_path='' as $$
begin
 perform public.check_automatic_collection_rules(new.automatic_rules,new.default_key);
 return new;
end;
$$;
revoke all on function public.check_automatic_collection_rules(jsonb,text) from public,anon;
grant execute on function public.check_automatic_collection_rules(jsonb,text) to authenticated,service_role;

-- Validate every relationship against the file, rather than allowing a forged
-- reference to be satisfied by an existing row belonging to another account.
create function public.validate_account_backup(p_backup jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t text; fk record; predicate text; nonnull text; invalid boolean; row_data jsonb; owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if octet_length(p_backup::text)>134217728 then raise exception 'Backup exceeds the 128 MiB restore limit'; end if;
 if p_backup->>'format' is distinct from 'between-chapters-backup' or p_backup->>'version' is distinct from '1'
  or jsonb_typeof(p_backup->'tables') is distinct from 'object' then raise exception 'Unsupported backup format'; end if;
 if p_backup->>'user_id' is distinct from owner_id::text then raise exception 'Choose a backup from your own account' using errcode='42501'; end if;
 foreach t in array public.library_backup_tables() loop
  if jsonb_typeof(p_backup->'tables'->t) is distinct from 'array' then raise exception 'Missing backup table: %',t; end if;
  if exists(select 1 from jsonb_array_elements(p_backup->'tables'->t) r where jsonb_typeof(r)<>'object'
   or (t=any((public.library_backup_tables())[8:19]) and r->>'user_id' is distinct from owner_id::text)) then
   raise exception 'Invalid backup owner or row: %',t;
  end if;
  for fk in select c.oid,c.confrelid,rt.relname target from pg_constraint c
   join pg_class rt on rt.oid=c.confrelid join pg_namespace n on n.oid=rt.relnamespace
   where c.conrelid=('public.'||t)::regclass and c.contype='f' and n.nspname='public'
   and rt.relname=any(public.library_backup_tables()) loop
   select string_agg(format('r->%L=s->%L',a.attname,b.attname),' and '),
    string_agg(format('r->>%L is not null',a.attname),' and ')
   into predicate,nonnull from pg_constraint c cross join lateral unnest(c.conkey,c.confkey) k(a,b)
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.a
   join pg_attribute b on b.attrelid=c.confrelid and b.attnum=k.b where c.oid=fk.oid;
   execute format('select exists(select 1 from jsonb_array_elements($1) r where %s and not exists(select 1 from jsonb_array_elements($2) s where %s))',nonnull,predicate)
    into invalid using p_backup->'tables'->t,p_backup->'tables'->fk.target;
   if invalid then raise exception 'Invalid backup relationship: %',t; end if;
  end loop;
 end loop;
 for row_data in select value from jsonb_array_elements(p_backup->'tables'->'collections') loop
  perform public.check_automatic_collection_rules(nullif(row_data->'automatic_rules','null'::jsonb),row_data->>'default_key');
 end loop;
 if exists(select 1 from jsonb_array_elements(p_backup->'tables'->'library_series') s
  where jsonb_typeof(s->'metadata') is distinct from 'object'
   or (s->'metadata' ? 'works' and jsonb_typeof(s->'metadata'->'works') is distinct from 'array')
   or (s->'metadata' ? 'creators' and jsonb_typeof(s->'metadata'->'creators') is distinct from 'array')) then
  raise exception 'Invalid saved series metadata';
 end if;
 if exists(select 1 from jsonb_array_elements((p_backup->'tables'->'collection_works')||(p_backup->'tables'->'collection_series')) m
  join jsonb_array_elements(p_backup->'tables'->'collections') c on m->>'collection_id'=c->>'id'
  where nullif(c->'automatic_rules','null'::jsonb) is not null) then
  raise exception 'Automatic collection membership must be determined by its rules';
 end if;
end;
$$;
revoke all on function public.validate_account_backup(jsonb) from public,anon,authenticated,service_role;

create function public.preview_library_restore(p_backup jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare current_backup jsonb; result jsonb;
begin
 perform public.validate_account_backup(p_backup);
 -- A subtransaction exercises the real constraints and restores the index, then
 -- rolls everything back. Preview never leaves changed data or disabled triggers.
 begin
  perform public.restore_library_backup_internal(p_backup,auth.uid(),true,true);
  raise exception using errcode='PT001',message='preview_rollback';
 exception when sqlstate 'PT001' then null;
 end;
 current_backup:=public.export_library_backup();
 select jsonb_object_agg(t,jsonb_build_object('current',jsonb_array_length(current_backup->'tables'->t),
  'backup',jsonb_array_length(p_backup->'tables'->t))) into result
 from unnest((public.library_backup_tables())[8:19]) t;
 return jsonb_build_object('counts',result,'fingerprint',md5((current_backup->'tables')::text),'exported_at',p_backup->>'exported_at');
end;
$$;

create function public.restore_own_library_backup(p_backup jsonb,p_fingerprint text,p_safety_path text) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare t text; safety_id uuid; identities jsonb;
begin
 perform public.validate_account_backup(p_backup);
 foreach t in array public.library_backup_tables() loop
  execute format('lock table public.%I in access exclusive mode',t);
 end loop;
 if p_fingerprint is distinct from md5((public.export_library_backup()->'tables')::text) then
  raise exception 'Your library changed. Preview the backup again before restoring.' using errcode='40001';
 end if;
 select id into safety_id from storage.objects where bucket_id='library-backups' and name=p_safety_path
  and split_part(name,'/',1)=auth.uid()::text and created_at>clock_timestamp()-interval '15 minutes' for share;
 if safety_id is null then raise exception 'Save a safety backup before restoring.'; end if;
 identities:=public.restore_library_backup_internal(p_backup,auth.uid(),true,true);
 return identities;
end;
$$;
revoke all on function public.preview_library_restore(jsonb),public.restore_own_library_backup(jsonb,text,text) from public,anon;
grant execute on function public.preview_library_restore(jsonb),public.restore_own_library_backup(jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
