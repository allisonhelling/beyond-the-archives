begin;

-- The shared pool owns author/shelf/series semantics for pages and cached facets.
-- Manual collections use the existing (collection_id,library_entry_id) primary
-- key before loading JSON documents; series views retain their full work context.
create function public.library_query_pool(p_query jsonb)
returns table(s jsonb,payload jsonb,search_any text,search_summary text,search_notes text)
language plpgsql stable set search_path='' as $pool$
#variable_conflict use_column
declare series_requested boolean; collection_rules jsonb; manual_collection uuid;
begin
 series_requested:=p_query->>'author' is null and coalesce(p_query->>'mode'<>'reading',false) and
  (coalesce(p_query->>'mode'='series',false) or coalesce(p_query->>'shelf'='series',false)
   or coalesce((p_query->'filters'->>'showSeries')::boolean,false));
 select c.automatic_rules into collection_rules from public.collections c
 where c.user_id=(select auth.uid()) and c.id::text=p_query->>'shelf';
 select c.id into manual_collection from public.collections c
 where c.user_id=(select auth.uid()) and c.id::text=p_query->>'shelf'
 and c.default_key is null and c.automatic_rules is null and not series_requested and p_query->>'mode'<>'reading';
 return query
 with candidates as materialized (
  select d.id from public.library_search_documents d where d.user_id=(select auth.uid()) and manual_collection is null
  union all
  select cw.library_entry_id from public.collection_works cw
   where manual_collection is not null and cw.collection_id=manual_collection and cw.user_id=(select auth.uid())
 ), works as materialized (select d.story s,d.search_any,d.search_summary,d.search_notes
 from candidates c join public.library_search_documents d on d.id=c.id where d.user_id=(select auth.uid())
   and (p_query->>'author' is null or d.story->'metadata'->'authors' @> jsonb_build_array(p_query->>'author'))),
 series_work_ids as materialized (select distinct w->>'workId' id from public.library_series r cross join lateral jsonb_array_elements(r.metadata->'works') w where r.user_id=(select auth.uid()) and series_requested),
 series as materialized (select * from public.library_series_results(coalesce((select jsonb_agg(s) from works where series_requested and (coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb or s->'work'->>'ao3_work_id' in (select id from series_work_ids))),'[]')) where series_requested),
 documents as materialized (select s,null::jsonb payload,search_any,search_summary,search_notes from works union all select story,payload,public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch','')),public.library_normalize(story->'metadata'->>'summary'),public.library_normalize(story->>'notes') from series),
 pool as materialized (select * from documents where
  (s->>'id' not like 'series:%' or p_query->>'mode'='series' or p_query->>'shelf'='series' or coalesce((p_query->'filters'->>'showSeries')::boolean,false)) and case when p_query->>'mode'='reading' then s->>'id' not like 'series:%' and s->>'reading_status' in ('reading','re_reading','waiting_for_updates','to_read','paused_reading') else case when collection_rules is not null then
   s->>'id' not like 'series:%' and public.automatic_collection_matches(s,collection_rules)
   else (coalesce(p_query->>'shelf','all')='all' or public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library')) end end)
 select * from pool;
end;
$pool$;

create function public.library_query_facets(p_query jsonb default '{}') returns jsonb
language sql stable set search_path='' as $facets$
 with pool as materialized (select * from public.library_query_pool(p_query))
 select jsonb_build_object(
 'suggestions',jsonb_build_object('personalTags',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'personalTags','[]'))) t),'relationships',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'relationship_tags','[]'))) t),'characters',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'character_tags','[]'))) t),'tags',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'additional_tags','[]'))) t)),
 'fandoms',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'count',c) order by name),'[]') from (select name,count(*) c from pool cross join lateral (select distinct value name from jsonb_array_elements_text(s->'metadata'->'fandoms')) names group by name) f), 'total',(select count(*) from pool));
$facets$;

create or replace function public.query_library(p_query jsonb default '{}',p_page integer default 1,p_size integer default 50)
returns jsonb language plpgsql stable set search_path='' as $query$

declare result jsonb;
begin
 if p_size not in (25,50,100,250) or p_page<1 then raise exception 'Invalid pagination' using errcode='22023'; end if;

 with pool as materialized (select * from public.library_query_pool(p_query)),
 filtered as materialized (select * from pool where public.library_filter(s,coalesce(p_query->'filters','{}'),p_query->'terms',case p_query->'filters'->>'scope' when 'summary' then search_summary when 'notes' then search_notes else search_any end)),
 selected as materialized (select * from filtered where p_query->>'mode'<>'reading' or public.library_in_shelf(s,coalesce(p_query->>'shelf','view_all'),'reading')),
 totals as (select count(*) total,greatest(1,ceil(count(*)::numeric/p_size)::integer) pages from selected),
 ordered as (select *,row_number() over(order by
 case when p_query->'filters'->>'sort'='random' then public.library_shuffle_key(s->>'id',coalesce(p_query->'filters'->>'randomSeed','')) end,
 case when p_query->'filters'->>'sort'='random' then s->>'id' end collate "C",
 case when p_query->'filters'->>'sort'='alpha' then s->'metadata'->>'title' end collate "und-x-icu" asc,
 case when p_query->'filters'->>'sort'='alpha_reverse' then s->'metadata'->>'title' end collate "und-x-icu" desc,
 case when coalesce(p_query->'filters'->>'sort','added')='added' then nullif(s->>'created_at','')::timestamptz end desc nulls last,
 case when p_query->'filters'->>'sort'='added_reverse' then nullif(s->>'created_at','')::timestamptz end asc nulls last,
 case when p_query->'filters'->>'sort'='updated' then (s->'work'->>'ao3_updated_at')::timestamptz end desc nulls last,
 case when p_query->'filters'->>'sort'='updated_reverse' then (s->'work'->>'ao3_updated_at')::timestamptz end asc nulls last,
 case when p_query->'filters'->>'sort'='ready' then case when s->'metadata'->>'published_chapters' is not null then greatest(0,(s->'metadata'->>'published_chapters')::integer-(s->>'last_read_chapter')::integer) end end desc nulls last,
 case when p_query->'filters'->>'sort'='ready_reverse' then case when s->'metadata'->>'published_chapters' is not null then greatest(0,(s->'metadata'->>'published_chapters')::integer-(s->>'last_read_chapter')::integer) end end asc nulls last,
 s->'metadata'->>'title' collate "und-x-icu",s->>'id' collate "C") n from selected),
 page_entries as (select ordered.* from ordered,totals where n> (least(p_page,pages)-1)*p_size and n<=least(p_page,pages)*p_size order by n),
 page as materialized (select s || case when payload is null then
  jsonb_build_object('automaticCollectionIds',public.automatic_collection_ids(s,(select auth.uid())))
  else '{}'::jsonb end s,payload,n from page_entries)
 select jsonb_build_object('total',total,'page',least(p_page,pages),'pages',pages,
 'stories',coalesce((select jsonb_agg(s-'queryText'-'oneShots'-'ratings'-'extraSearch'-'extension_metadata'-'extension_chapters'-'metadata_overrides'
 ||jsonb_build_object('metadata_overrides','{}'::jsonb,'work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at','verified_chapters',case when s->'work'->'verified_chapters' ? ((s->>'last_read_chapter')::integer+1)::text then jsonb_build_object(((s->>'last_read_chapter')::integer+1)::text,s->'work'->'verified_chapters'->((s->>'last_read_chapter')::integer+1)::text) else '{}'::jsonb end)) order by n) from page),'[]'),
 'series',coalesce((select jsonb_agg(payload||jsonb_build_object('record',nullif(payload->'record','null'::jsonb)-'metadata','savedStories',(select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','personal_rating',v->'personal_rating','reading_status',v->'reading_status','last_read_chapter',v->'last_read_chapter','work',jsonb_build_object('id',v->'work'->'id','ao3_work_id',v->'work'->'ao3_work_id'))),'[]') from jsonb_array_elements(payload->'savedStories') v)) order by n) from page where payload is not null),'[]'),
 'sections',case when p_query->>'mode'='reading' then (select jsonb_object_agg(k,(select count(*) from filtered where public.library_in_shelf(s,k,'reading'))) from unnest(array['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading']) k) else '{}'::jsonb end,
 'facets',case when coalesce((p_query->>'includeFacets')::boolean,true) then public.library_query_facets(p_query) else null end) into result from totals;
 return (result-'facets') || (coalesce(nullif(result->'facets','null'::jsonb),'{}'::jsonb)-'total');
end;
$query$;

-- Counts and sort timestamps are small navigation data, independent of the catalog.
create function public.library_navigation() returns jsonb
language sql stable set search_path='' as $navigation$
 with documents as materialized (
  select * from public.library_query_pool('{"mode":"library","shelf":"all","filters":{"showSeries":true}}')
 ), shelves as (
  select k key,null::jsonb rules from unnest(array['all','currently_reading','paused_reading','to_read','finished','did_not_finish','series','recs','favorites']) k
  union all select id::text,automatic_rules from public.collections where user_id=(select auth.uid()) and default_key is null
 ), counts as (
  select key,
   count(d.s) filter(where d.payload is null and key<>'series') works,
   count(d.s) filter(where d.payload is not null) series,
   max(nullif(d.s->>'updated_at','')::timestamptz) filter(where coalesce(d.s->'collectionIds','[]') ? key) updated_at
  from shelves left join documents d on case when rules is not null then
   d.payload is null and public.automatic_collection_matches(d.s,rules)
   else key='all' or public.library_in_shelf(d.s,key,'library') end
  group by key
 ) select coalesce(jsonb_object_agg(key,jsonb_build_object('works',works,'series',series,'updated_at',updated_at)),'{}') from counts;
$navigation$;

revoke all on function public.library_query_pool(jsonb),public.library_query_facets(jsonb),public.library_navigation() from public,anon;
grant execute on function public.library_query_pool(jsonb),public.library_query_facets(jsonb),public.library_navigation() to authenticated;
notify pgrst,'reload schema';
commit;
