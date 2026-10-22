begin;

-- Per-job historical cutoff and the personal edit version captured at import.
alter table public.metadata_jobs add column bookmark_import jsonb;

create function public.preview_ao3_csv_import(p_work_ids bigint[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if coalesce(array_length(p_work_ids,1),0)>2000 then raise exception 'Too many works'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('workId',w.ao3_work_id,'id',e.id,'version',e.updated_at,
  'title',coalesce(e.metadata_overrides->>'title',e.extension_metadata->>'title',w.title),'status',e.reading_status,
  'progress',e.last_read_chapter,'notes',e.notes,'tags',coalesce((select jsonb_agg(t.name order by t.name) from public.library_entry_tags et join public.personal_tags t on t.id=et.personal_tag_id where et.library_entry_id=e.id),'[]'::jsonb)))
  from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=auth.uid() and w.ao3_work_id=any(p_work_ids)),'[]'::jsonb);
end $$;

create function public.submit_ao3_csv_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); r jsonb; batch uuid; item public.import_items; entry public.library_entries;
 selected_rows jsonb:='[]'; urls text[]:='{}'; kept integer:=0; imported integer:=0; metadata jsonb; v_status public.reading_status;
 progress integer; bookmark date; updated date; tags text[]; collections uuid[]; wid bigint;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>20000000 then raise exception 'Submit 1–2000 CSV works'; end if;
 if (select count(*)<>count(distinct value->>'workId') from jsonb_array_elements(p_rows)) then raise exception 'Duplicate CSV works'; end if;
 -- Stable locking order protects conflict review and concurrent edits through commit.
 for r in select value from jsonb_array_elements(p_rows) order by (value->>'workId')::bigint loop
  wid:=(r->>'workId')::bigint;
  if wid<1 or wid>9007199254740991 or r->>'url' is distinct from 'https://archiveofourown.org/works/'||wid
   or coalesce(r->>'source','') not in ('bookmarks','marked_for_later') or coalesce(r->>'choice','') not in ('keep','overwrite') then raise exception 'Invalid CSV work'; end if;
  insert into public.works(ao3_work_id) values(wid) on conflict do nothing;
  perform 1 from public.works where ao3_work_id=wid for update;
  select e.* into entry from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=owner_id and w.ao3_work_id=wid for update of e;
  if entry.id is not null and (r->>'source'='marked_for_later' or r->>'choice'='keep') then kept:=kept+1; continue; end if;
  if (entry.id is not null and (r->>'expectedVersion' is null or entry.updated_at is distinct from (r->>'expectedVersion')::timestamptz))
   or (entry.id is null and r->>'expectedVersion' is not null) then raise exception 'CSV conflicts changed' using errcode='40001'; end if;
  selected_rows:=selected_rows||jsonb_build_array(r); urls:=array_append(urls,r->>'url');
 end loop;
 if cardinality(urls)=0 then return jsonb_build_object('batch',null,'imported',0,'kept',kept); end if;
 batch:=public.submit_import_urls(urls,false);
 for r in select value from jsonb_array_elements(selected_rows) loop
  select * into item from public.import_items where batch_id=batch and ao3_work_id=(r->>'workId')::bigint;
  select * into entry from public.library_entries where id=item.entry_id for update;
  if item.result='already_saved' and (r->>'expectedVersion' is null or entry.updated_at is distinct from (r->>'expectedVersion')::timestamptz) then raise exception 'CSV conflicts changed' using errcode='40001'; end if;
  metadata:=r->'metadata';
  if jsonb_typeof(metadata)<>'object' or coalesce(length(trim(metadata->>'title')),0)=0 then raise exception 'CSV title is required'; end if;
  bookmark:=(r->>'bookmarkDate')::date; updated:=(r->>'updatedDate')::date;
  progress:=0; v_status:='to_read';
  if r->>'source'='bookmarks' then
   v_status:=case when bookmark>updated then 'finished'::public.reading_status else 'reading'::public.reading_status end;
   if v_status='finished' then progress:=coalesce((metadata->>'published_chapters')::integer,0); end if;
  end if;
  select coalesce(array_agg(c.collection_id),'{}'::uuid[]) into collections from public.collection_works c join public.collections co on co.id=c.collection_id where c.library_entry_id=entry.id and co.default_key is null;
  select coalesce(array_agg(value),'{}'::text[]) into tags from jsonb_array_elements_text(r->'tags');
  -- Reuse the existing metadata validation and personal tag replacement. CSV
  -- source fields then become private automatic data, so future refreshes work.
  update public.library_entries set metadata_overrides=metadata_overrides-array(select jsonb_object_keys(metadata))-'publication_status',last_read_chapter=0,started_at=null,finished_at=null where id=entry.id;
  perform public.save_library_story(r->>'url',metadata- 'is_complete' - 'ao3_updated_at',v_status,progress,coalesce(r->>'notes',''),entry.personal_rating,entry.is_favorite,collections,tags,entry.id);
  update public.library_entries set
   extension_metadata=extension_metadata || metadata || jsonb_build_object('publication_status',case when metadata->>'is_complete'='true' then 'complete' when metadata ? 'is_complete' then 'in_progress' else 'unknown' end),
   metadata_overrides=metadata_overrides-array(select jsonb_object_keys(metadata))-'publication_status',
   finished_at=case when v_status='finished' then (bookmark::text||'T00:00:00Z')::timestamptz else null end
   where id=entry.id returning * into entry;
  update public.metadata_jobs set requested_reading_status=v_status,bookmark_import=case when r->>'source'='bookmarks' then
   jsonb_build_object('date',bookmark,'updatedDate',updated,'version',entry.updated_at,'status',v_status) else null end where batch_id=batch and entry_id=entry.id;
  imported:=imported+1;
 end loop;
 return jsonb_build_object('batch',batch,'imported',imported,'kept',kept);
end $$;

-- Add the cutoff to the existing claims. Both retrieval modes use the same
-- finish boundary; jobs remain cancellable, fenced and visible in history.
do $$ declare definition text; updated text; signature text; begin
 foreach signature in array array['public.claim_metadata_job()','public.claim_extension_job()'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,'''workId'',wid,','''workId'',wid,''chapterDates'',coalesce(j.bookmark_import->>''status''=''reading'' and j.bookmark_import->>''date'' is not null,false),');
  if updated=definition then raise exception 'Review CSV claim integration'; end if;
  execute updated;
 end loop;
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,' final_state:=case',$hook$
 if p_metadata is not null and j.bookmark_import is not null then
  if j.retrieval_mode='direct' and j.bookmark_import->>'status'='reading' and j.bookmark_import->>'date' is not null then
   update public.metadata_worker_state set next_request_at=greatest(next_request_at,now()+interval '15 seconds') where id=1;
  end if;
  -- A personal edit after import wins over historical inference.
  if j.bookmark_import->>'status'='reading' and j.bookmark_import->>'date' is not null and p_metadata ? 'chapter_dates' then
   best:=0;
   for pos in 1..coalesce((p_metadata->>'published_chapters')::integer,0) loop
    exit when not (p_metadata->'chapter_dates' ? pos::text)
     or (p_metadata->'chapter_dates'->>pos::text)::date >= (j.bookmark_import->>'date')::date;
    best:=pos;
   end loop;
   update public.library_entries set last_read_chapter=best where id=j.entry_id and user_id=j.user_id
    and updated_at=(j.bookmark_import->>'version')::timestamptz and reading_status='reading' and last_read_chapter=0;
  end if;
  if j.bookmark_import->>'status'='finished' and p_metadata ? 'published_chapters' then
   update public.library_entries set last_read_chapter=(p_metadata->>'published_chapters')::integer where id=j.entry_id and user_id=j.user_id
    and updated_at=(j.bookmark_import->>'version')::timestamptz and reading_status='finished' and last_read_chapter=0;
  end if;
 end if;
 final_state:=case$hook$);
 if updated=definition then raise exception 'Review CSV progress integration'; end if;
 execute updated;
end $$;
revoke all on function public.preview_ao3_csv_import(bigint[]),public.submit_ao3_csv_import(jsonb) from public,anon,authenticated;
grant execute on function public.preview_ao3_csv_import(bigint[]),public.submit_ao3_csv_import(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
