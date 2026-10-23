begin;

-- Every explicit deleted-bookmark observation applies, including Quick Sync
-- and scans saved by older companions with the former opt-out setting.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, 'case when desired=''deleted'' and not created and (coalesce(r->>''scanMode'',''full'')=''quick'' or r->>''updateDeleted''=''false'') then work_status else desired end', 'desired');
 if updated=definition then raise exception 'Review deleted bookmark observation'; end if;
 execute updated;

 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition, '(''unknown'',''in_progress'',''complete'',''abandoned'')', '(''unknown'',''in_progress'',''complete'',''abandoned'',''deleted'')');
 if updated=definition then raise exception 'Review publication status validation'; end if;
 execute updated;

 -- Project availability as a publication status without overwriting any saved
 -- source metadata or private corrections. All queries share this projection.
 select pg_get_viewdef('public.library_story_documents'::regclass,true) into definition;
 updated:=replace(definition, '|| e.metadata_overrides', '|| e.metadata_overrides || case when e.work_status=''deleted'' then jsonb_build_object(''publication_status'',''deleted'') else ''{}''::jsonb end');
 if updated=definition then raise exception 'Review deleted publication projection'; end if;
 execute 'create or replace view public.library_story_documents with (security_invoker=true) as '||updated;

 select pg_get_functiondef('public.library_search_text(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, 'when ''abandoned'' then ''Abandoned''', 'when ''abandoned'' then ''Abandoned'' when ''deleted'' then ''Deleted''');
 if updated=definition then raise exception 'Review deleted publication search label'; end if;
 execute updated;
end $$;

-- A refresh reports a missing page; only the owner confirms deletion. Update
-- one availability field, preserving metadata, progress, tags, and notes.
create function public.mark_work_deleted(p_entry uuid, p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.metadata_jobs j where j.id=p_job and j.entry_id=p_entry and j.user_id=auth.uid() and j.status='failed' and j.error_category='not_found') then
  raise exception 'A confirmed AO3 404 refresh is required' using errcode='42501';
 end if;
 update public.library_entries set work_status='deleted' where id=p_entry and user_id=auth.uid();
 if not found then raise exception 'Work unavailable' using errcode='42501'; end if;
end $$;
revoke all on function public.mark_work_deleted(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_work_deleted(uuid,uuid) to authenticated;

select public.refresh_library_documents(array(select id from public.library_entries));
notify pgrst,'reload schema';
commit;
