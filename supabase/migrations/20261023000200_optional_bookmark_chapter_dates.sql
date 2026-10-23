begin;

-- Shared by initial listing imports and delayed CSV metadata completion.
create function public.bookmark_chapter_progress(dates jsonb,published integer,bookmark date) returns integer
language plpgsql immutable set search_path='' as $$
declare pos integer; best integer:=0;
begin
 if jsonb_typeof(dates) is distinct from 'object' or published is null or published<1 or bookmark is null then return 0; end if;
 for pos in 1..published loop
  exit when jsonb_typeof(dates->pos::text) is distinct from 'string'
   or (dates->>pos::text) !~ '^\d{4}-\d{2}-\d{2}$'
   or (dates->>pos::text)::date >= bookmark;
  best:=pos;
 end loop;
 return best;
exception when invalid_datetime_format or datetime_field_overflow then return 0;
end $$;
revoke all on function public.bookmark_chapter_progress(jsonb,integer,date) from public,anon,authenticated;

do $$ declare definition text; updated text; signature text; begin
 select pg_get_functiondef('public.submit_ao3_csv_works(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '  select coalesce(array_agg(c.collection_id)', $hook$
  if coalesce(r->'checkChapterDates'<>'false'::jsonb,true) and v_status='reading' and r->>'source'='bookmarks' and metadata ? 'chapter_dates' then
   progress:=public.bookmark_chapter_progress(metadata->'chapter_dates',(metadata->>'published_chapters')::integer,bookmark);
  end if;
  if r ? 'checkChapterDates' and jsonb_typeof(r->'checkChapterDates') is distinct from 'boolean' then raise exception 'Invalid chapter-date option' using errcode='22023'; end if;
  select coalesce(array_agg(c.collection_id)$hook$);
 updated:=replace(updated, $old$'date',bookmark,'updatedDate',updated,$old$, $new$'date',bookmark,'updatedDate',updated,'checkChapterDates',coalesce(r->'checkChapterDates','true'::jsonb),$new$);
 if updated=definition or updated not like '%Invalid chapter-date option%' then raise exception 'Review optional bookmark chapter dates'; end if;
 execute updated;

 foreach signature in array array['public.claim_metadata_job()','public.claim_extension_job()'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition, $old$'chapterDates',coalesce(j.bookmark_import->>'status'='reading'$old$,
   $new$'chapterDates',coalesce(j.bookmark_import->'checkChapterDates'<>'false'::jsonb,true) and coalesce(j.bookmark_import->>'status'='reading'$new$);
  if updated=definition then raise exception 'Review chapter-date claim option: %',signature; end if;
  execute updated;
 end loop;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, $old$if j.bookmark_import->>'status'='reading' and j.bookmark_import->>'date' is not null and p_metadata ? 'chapter_dates' then$old$,
  $new$if coalesce(j.bookmark_import->'checkChapterDates'<>'false'::jsonb,true) and j.bookmark_import->>'status'='reading' and j.bookmark_import->>'date' is not null and p_metadata ? 'chapter_dates' then$new$);
 updated:=replace(updated, $old$   best:=0;
   for pos in 1..coalesce((p_metadata->>'published_chapters')::integer,0) loop
    exit when not (p_metadata->'chapter_dates' ? pos::text)
     or (p_metadata->'chapter_dates'->>pos::text)::date >= (j.bookmark_import->>'date')::date;
    best:=pos;
   end loop;$old$, $new$   best:=public.bookmark_chapter_progress(p_metadata->'chapter_dates',(p_metadata->>'published_chapters')::integer,(j.bookmark_import->>'date')::date);$new$);
 if updated=definition or updated not like '%best:=public.bookmark_chapter_progress%' then raise exception 'Review shared bookmark progress inference'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
