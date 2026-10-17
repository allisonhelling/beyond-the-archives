begin;

-- Explicit imports can set a reading location; metadata-only refreshes cannot.
alter table public.metadata_jobs add column update_reading_location boolean not null default false;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.submit_import_urls(text[])'::regprocedure) into definition;
 updated:=replace(definition, 'submit_import_urls(p_urls text[])',
  'submit_import_urls(p_urls text[], p_update_reading_location boolean DEFAULT false)');
 updated:=replace(updated,
  'insert into public.metadata_jobs(batch_id,user_id,work_id,entry_id,created_entry) values(batch,owner_id,work_uuid,entry_uuid,created)',
  'insert into public.metadata_jobs(batch_id,user_id,work_id,entry_id,created_entry,update_reading_location) values(batch,owner_id,work_uuid,entry_uuid,created,coalesce(p_update_reading_location,false))');
 if updated=definition or updated not like '%created,coalesce(p_update_reading_location,false)%' then
  raise exception 'Review explicit import reading location';
 end if;
 -- Replace the signature rather than leaving ambiguous PostgREST overloads.
 drop function public.submit_import_urls(text[]);
 execute updated;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, $old$  if j.created_entry and best>0 then
   -- Do not change progress if the user edited the entry while retrieval was pending.
   update public.library_entries set last_read_chapter=best,reading_status='reading'
    where id=j.entry_id and user_id=j.user_id and reading_status='to_read' and last_read_chapter=0 and updated_at=created_at;
  end if;$old$, $new$  if best>=0 and (j.update_reading_location or (j.created_entry and best>0)) then
   -- The submitted chapter is the requested location, including when re-reading.
   -- Edits made after submission take precedence over delayed retrieval results.
   update public.library_entries set last_read_chapter=best,
    reading_status=case when reading_status='to_read' and best>0 then 'reading' else reading_status end
    where id=j.entry_id and user_id=j.user_id and (
     (j.update_reading_location and updated_at<=j.created_at) or
     (not j.update_reading_location and reading_status='to_read' and last_read_chapter=0 and updated_at=created_at)
    );
  end if;$new$);
 if updated=definition then raise exception 'Review verified chapter reading location'; end if;
 execute updated;
end $$;
revoke all on function public.submit_import_urls(text[],boolean) from public,anon,authenticated;
grant execute on function public.submit_import_urls(text[],boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
