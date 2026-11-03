begin;

-- Extend the existing private publication override and normalize caught-up WIPs
-- at the common write boundary, including organizer, reader and companion saves.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition,'''abandoned'',''deleted'')','''abandoned'',''deleted'',''hiatus'')');
 if updated=definition then raise exception 'Review hiatus validation'; end if;
 updated:=replace(updated,'  return new;', $new$
  if new.reading_status in ('reading','re_reading') and new.work_status <> 'deleted' then
    declare effective jsonb; begin
      select jsonb_build_object('published_chapters',w.published_chapters,
        'publication_status',case when w.is_complete then 'complete' when w.is_complete=false then 'in_progress' else 'unknown' end)
        ||w.automatic_metadata||new.extension_metadata||m into effective from public.works w where w.id=new.work_id;
      if effective->>'publication_status' in ('in_progress','hiatus')
        and (effective->>'published_chapters')::integer > 0
        and new.last_read_chapter >= (effective->>'published_chapters')::integer then
        new.reading_status:='waiting_for_updates';
      end if;
    end;
  end if;
  return new;$new$);
 execute updated;
 select pg_get_functiondef('public.library_search_text(jsonb,text)'::regprocedure) into definition;
 execute replace(definition,'when ''abandoned'' then','when ''hiatus'' then ''On Hiatus'' when ''abandoned'' then');
end $$;

create function public.library_crossover(m jsonb) returns boolean
language sql immutable set search_path='' as $$
 select count(distinct public.library_normalize(trim(value)))>1
 from jsonb_array_elements_text(coalesce(m->'fandoms','[]')) where trim(value)<>'';
$$;
revoke all on function public.library_crossover(jsonb) from public,anon;
grant execute on function public.library_crossover(jsonb) to authenticated,service_role;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition,' and (not coalesce((f->>''inSeries'')',
 $new$ and (coalesce(f->>'crossovers','allowed')='allowed' or coalesce(s->'crossovers',jsonb_build_array(public.library_crossover(s->'metadata'))) @> jsonb_build_array(f->>'crossovers'='only'))
 and (not coalesce((f->>'inSeries')$new$);
 if updated=definition then raise exception 'Review crossover filtering'; end if;
 updated:=replace(updated,
 $old$public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]'))))$old$,
 $new$coalesce(s->>'normalizedQueryText',public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]')))))$new$);
 execute updated;
 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition,'''query'',''oneShot''','''query'',''crossovers'',''oneShot''');
 updated:=replace(updated,$old$if coalesce(f->>'scope','any')$old$,$new$if coalesce(f->>'crossovers','allowed') not in ('allowed','only','exclude') or coalesce(f->>'scope','any')$new$);
 if updated=definition then raise exception 'Review crossover collection rules'; end if;
 execute updated;
 select pg_get_functiondef('public.library_series_results(jsonb,boolean,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'''oneShots'',', $new$'crossovers',(select coalesce(jsonb_agg(distinct public.library_crossover(jsonb_build_object('fandoms',coalesce(w->'fandoms','[]')))),'[]') from jsonb_array_elements(works) w),
 'oneShots',$new$);
 if updated=definition then raise exception 'Review series crossover sources'; end if;
 execute updated;
end $$;

-- Use the existing owner/revision cache for normalized series search text too.
-- Title/author searches normalize installment names once per revision. Full
-- within-text searches remain lazy; facets never construct that larger text.
create function public.library_series_search_document(s jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select s||jsonb_build_object(
  'normalizedQueryText',public.library_normalize(coalesce(s->>'queryText','')));
$$;
revoke all on function public.library_series_search_document(jsonb) from public,anon;
grant execute on function public.library_series_search_document(jsonb) to authenticated,service_role;
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_cached_series(boolean)'::regprocedure) into definition;
 updated:=replace(definition,'select * from public.library_series_results(', 'select public.library_series_search_document(story) story,payload from public.library_series_results(');
 if updated=definition then raise exception 'Review series search cache'; end if;
 execute updated;
end $$;

-- Extend the existing deterministic work/series sorting; unknown counts stay last.
alter table public.library_search_documents add column sort_words bigint generated always as ((story->'metadata'->>'word_count')::bigint) stored;
create index library_documents_words_idx on public.library_search_documents(user_id,sort_words desc nulls last,sort_title,id);
create index library_documents_words_reverse_idx on public.library_search_documents(user_id,sort_words asc nulls last,sort_title,id);
do $$ declare definition text; updated text; signature text; begin
 select pg_get_functiondef('public.library_query_work_sql(jsonb,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'when ''random'' then', $new$when 'words' then 'sort_words desc nulls last,sort_title,id' when 'words_reverse' then 'sort_words asc nulls last,sort_title,id'
   when 'random' then$new$);
 updated:=replace(updated,'d.sort_ready,d.reading_sections','d.sort_ready,d.sort_words,d.reading_sections');
 updated:=replace(updated,'e.key=''oneShot''','e.key in (''oneShot'',''crossovers'')');
 if updated=definition then raise exception 'Review work word-count sort'; end if;
 execute updated;
 foreach signature in array array['public.library_query_series_matches(jsonb,jsonb,integer,integer)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,' s->''metadata''->>''title'' collate', $new$ case when p_query->'filters'->>'sort'='words' then (s->'metadata'->>'word_count')::bigint end desc nulls last,
 case when p_query->'filters'->>'sort'='words_reverse' then (s->'metadata'->>'word_count')::bigint end asc nulls last,
 s->'metadata'->>'title' collate$new$);
  if updated=definition then raise exception 'Review series word-count sort'; end if;
  execute updated;
 end loop;
end $$;
-- Keep derived search helpers out of public card documents.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,$old$s-'queryText'$old$,$new$s-'normalizedQueryText'-'crossovers'-'queryText'$new$);
 if updated=definition then raise exception 'Review series search response projection'; end if;
 execute updated;
end $$;
-- Cached pools predate the new searchable projection and crossover evidence.
delete from public.library_query_cache;
update public.library_entries e set reading_status='waiting_for_updates'
from public.library_search_documents d where d.id=e.id and e.reading_status in ('reading','re_reading')
 and d.story->'metadata'->>'publication_status' in ('in_progress','hiatus')
 and (d.story->'metadata'->>'published_chapters')::integer>0
 and e.last_read_chapter >= (d.story->'metadata'->>'published_chapters')::integer;
notify pgrst,'reload schema';
commit;
