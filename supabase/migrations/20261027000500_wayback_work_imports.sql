begin;

-- Unwrap only a fixed Wayback capture of AO3. Existing work validation still
-- checks path, IDs, credentials, ports and work ownership after unwrapping.
create function public.ao3_source_target(p_url text) returns text
language sql immutable set search_path='' as $$
 select case when trim(p_url) like 'https://web.archive.org/%' then
  coalesce((regexp_match(trim(p_url),'^https://web\.archive\.org/web/[0-9]{14}(id_|if_)?/(https?://(www\.)?archiveofourown\.org/[^[:space:]]*)$'))[2],'')
 else trim(p_url) end;
$$;
revoke all on function public.ao3_source_target(text) from public,anon;
grant execute on function public.ao3_source_target(text) to authenticated,service_role;

-- A job's source is derived from its owned submitted items, never a browser
-- result. No additional fetch endpoint, metadata queue or source column.
create function public.metadata_job_archive_source(p_job uuid) returns text
language sql stable security definer set search_path='' as $$
 select trim(i.original_url) from public.metadata_jobs j
 join public.works w on w.id=j.work_id
 join public.import_items i on i.batch_id=j.batch_id and i.user_id=j.user_id and i.ao3_work_id=w.ao3_work_id
 where j.id=p_job and trim(i.original_url) like 'https://web.archive.org/web/%'
  and public.ao3_source_target(i.original_url)<>''
 order by i.ordinal limit 1;
$$;
revoke all on function public.metadata_job_archive_source(uuid) from public,anon,authenticated;
grant execute on function public.metadata_job_archive_source(uuid) to service_role;

do $$ declare signature text; definition text; updated text; begin
 foreach signature in array array[
  'public.submit_import_urls(text[],boolean,public.reading_status,bigint[])',
  'public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)',
  'public.restore_library_story(jsonb,uuid[],text[])'
 ] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,'trim(original)','public.ao3_source_target(original)');
  updated:=replace(updated,'trim(p_url)','public.ao3_source_target(p_url)');
  updated:=replace(updated,'trim(restored.original_url)','public.ao3_source_target(restored.original_url)');
  updated:=replace(updated,'archiveofourown\.org/works/','archiveofourown\.org/(collections/[^/?#[:space:]]+/)?works/');
  if updated=definition then raise exception 'Review archived URL validation: %',signature; end if;
  execute updated;
 end loop;
 foreach signature in array array['public.claim_metadata_job()','public.claim_extension_job()'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,'''workId'',wid,','''workId'',wid,''sourceUrl'',public.metadata_job_archive_source(j.id),');
  if updated=definition then raise exception 'Review archived metadata claim: %',signature; end if;
  execute updated;
 end loop;
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 -- Historical snapshots must not overwrite current globally shared metadata or
 -- establish a verified live canonical URL. Reuse private browser observations.
 updated:=replace(definition,'j.retrieval_mode=''extension''','(j.retrieval_mode=''extension'' or public.metadata_job_archive_source(j.id) is not null)');
 updated:=replace(updated,'j.retrieval_mode=''direct''','(j.retrieval_mode=''direct'' and public.metadata_job_archive_source(j.id) is null)');
 if updated=definition then raise exception 'Review private archive commit'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
