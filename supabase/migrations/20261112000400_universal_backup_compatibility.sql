begin;
-- Prevent an older schema from silently discarding general-source identity.
-- Existing AO3-only exports and older readable backups retain version 1.
do $$ declare definition text; updated text; signature text; begin
 select pg_get_functiondef('public.export_library_backup()'::regprocedure) into definition;
 updated:=replace(definition,'''version'',1,', $new$'version',case when exists(select 1 from public.library_entries where user_id=owner_id and source_url is not null) then 2 else 1 end,$new$);
 if updated=definition then raise exception 'Review source-aware backup version'; end if;
 execute updated;
 foreach signature in array array['public.validate_account_backup(jsonb)','public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition, $old$p_backup->>'version' is distinct from '1'$old$, $new$coalesce(p_backup->>'version','') not in ('1','2')$new$);
  if updated=definition then raise exception 'Review source-aware backup reader: %',signature; end if;
  updated:=replace(updated, $old$raise exception 'Unsupported backup format'; end if;$old$, $new$raise exception 'Unsupported backup format'; end if;
  if exists(select 1 from jsonb_array_elements(p_backup->'tables'->'library_entries') e where e->>'source_url' is not null) then
   if p_backup->>'version'<>'2' then raise exception 'Universal stories require a version 2 backup'; end if;
   if exists(select 1 from jsonb_array_elements(p_backup->'tables'->'library_entries') e where e->>'source_url' is not null and
    (e->>'source_url' is distinct from public.manual_story_url(e->>'source_url') or not public.valid_story_submission(e->>'original_url')
     or not exists(select 1 from jsonb_array_elements(p_backup->'tables'->'works') w where w->>'id'=e->>'work_id' and w->>'ao3_work_id' is null and w->>'canonical_url' is null)
     or exists(select 1 from public.works w where w.id=(e->>'work_id')::uuid and w.ao3_work_id is not null))) then
    raise exception 'Invalid private source identity in backup';
   end if;
  end if;$new$);
  execute updated;
 end loop;
end $$;
-- Unlike user triggers, CHECK constraints also run during account restore.
alter table public.library_entries add constraint valid_private_source_url
 check(source_url is null or source_url=public.manual_story_url(source_url) and public.valid_story_submission(original_url));
notify pgrst,'reload schema';
commit;
