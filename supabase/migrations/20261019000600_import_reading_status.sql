begin;

-- Retain an explicit import status when delayed chapter verification finishes.
alter table public.metadata_jobs add column requested_reading_status public.reading_status;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.submit_import_urls(text[],boolean)'::regprocedure) into definition;
 updated:=replace(definition,
  'p_update_reading_location boolean DEFAULT false)',
  'p_update_reading_location boolean DEFAULT false, p_reading_status public.reading_status DEFAULT NULL, p_series_ids bigint[] DEFAULT ARRAY[]::bigint[])');
 updated:=replace(updated,
  '  select id into first_item from public.import_items',
  '  if p_reading_status is not null then update public.library_entries set reading_status=p_reading_status where id=entry_uuid and user_id=owner_id; end if;
  select id into first_item from public.import_items');
 updated:=replace(updated,
  'created_entry,update_reading_location) values(batch,owner_id,work_uuid,entry_uuid,created,coalesce(p_update_reading_location,false))',
  'created_entry,update_reading_location,requested_reading_status) values(batch,owner_id,work_uuid,entry_uuid,created,coalesce(p_update_reading_location,false),p_reading_status)');
 updated:=replace(updated, ' return batch;',
  ' if p_reading_status is not null then
  update public.library_series set reading_status=p_reading_status where user_id=owner_id and ao3_series_id=any(p_series_ids);
 end if;
 return batch;');
 if updated=definition or updated not like '%p_reading_status public.reading_status DEFAULT NULL%'
  or updated not like '%set reading_status=p_reading_status where id=entry_uuid%'
  or updated not like '%false),p_reading_status)%'
  or updated not like '%ao3_series_id=any(p_series_ids)%' then
  raise exception 'Review import reading status function changes';
 end if;
 drop function public.submit_import_urls(text[],boolean);
 execute updated;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,
  'when reading_status=''to_read'' and best>0 then ''reading''',
  'when j.requested_reading_status is null and reading_status=''to_read'' and best>0 then ''reading''');
 if updated=definition then raise exception 'Review explicit status preservation during metadata retrieval'; end if;
 execute updated;
end $$;
revoke all on function public.submit_import_urls(text[],boolean,public.reading_status,bigint[]) from public,anon,authenticated;
grant execute on function public.submit_import_urls(text[],boolean,public.reading_status,bigint[]) to authenticated;
notify pgrst, 'reload schema';
commit;
