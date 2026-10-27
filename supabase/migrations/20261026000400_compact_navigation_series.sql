begin;

-- These predicates run for every shelf/work pair. Reuse their existing SQL
-- expressions while caching plans, as the automatic matching functions do.
do $$ declare signature regprocedure; definition text; expression text; updated text; begin
 foreach signature in array array[
  'public.library_in_shelf(jsonb,text,text)'::regprocedure,
  'public.library_one_shot(jsonb,jsonb)'::regprocedure,
  'public.library_normalize(text)'::regprocedure,
  'public.library_text(jsonb)'::regprocedure] loop
  select pg_get_functiondef(signature),prosrc into definition,expression from pg_proc where oid=signature;
  updated:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
  updated:=replace(updated,expression,E'begin\n return (' || regexp_replace(trim(expression),';\s*$','') || E');\nend;\n');
  if updated=definition or updated not like '%LANGUAGE plpgsql%' then
   raise exception 'Review navigation predicate plan caching: %',signature;
  end if;
  execute updated;
 end loop;
end $$;

-- Keep one series membership/status implementation. Navigation only needs the
-- shelf fields; pruning the preview projection avoids aggregating tags, summaries
-- and search text for every series just to count it.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'library_series_results(p_stories jsonb)',
  'library_series_results(p_stories jsonb, p_navigation boolean)');
 updated:=replace(updated,
  $old$ select jsonb_build_object('id','series:'||sid,'metadata',m,$old$,
  $new$ select case when p_navigation then jsonb_build_object(
   'id','series:'||sid,'reading_status',status,
   'is_favorite',coalesce((record->>'is_favorite')::boolean,false),
   'is_rec',coalesce((record->>'is_rec')::boolean,false),
   'collectionIds',coalesce(record->'collectionIds','[]'),
   'updated_at',record->>'updated_at')
  else jsonb_build_object('id','series:'||sid,'metadata',m,$new$);
 updated:=replace(updated,
  $old$ coalesce(preview,'{}')||jsonb_build_object('seriesId',sid,$old$,
  $new$ case when p_navigation then null::jsonb else coalesce(preview,'{}')||jsonb_build_object('seriesId',sid,$new$);
 -- Close the two projection CASE expressions at their existing boundaries.
 updated:=replace(updated,
  $old$from jsonb_array_elements(works) w)),
 case when p_navigation$old$,
  $new$from jsonb_array_elements(works) w)) end,
 case when p_navigation$new$);
 updated:=replace(updated,
  $old$
 from aggregates;$old$,
  $new$ end
 from aggregates;$new$);
 if updated=definition or updated not like '%w)) end,%' or updated not like '%p_navigation boolean%' then
  raise exception 'Review compact series projection';
 end if;
 execute updated;
end $$;

create or replace function public.library_series_results(p_stories jsonb)
returns table(story jsonb,payload jsonb)
language sql stable set search_path='' as $$
 select * from public.library_series_results(p_stories,false);
$$;

create or replace function public.library_navigation() returns jsonb
language sql stable set search_path='' set jit=off as $navigation$
 with works as materialized (
  select s from public.library_query_pool('{"mode":"library","shelf":"all","filters":{"showSeries":false}}')
 ), series_work_ids as materialized (
  select distinct w->>'workId' id from public.library_series r
  cross join lateral jsonb_array_elements(r.metadata->'works') w
  where r.user_id=(select auth.uid())
 ), series_works as (
  select jsonb_build_object('id',s->'id','reading_status',s->'reading_status',
   'work',jsonb_build_object('ao3_work_id',s->'work'->'ao3_work_id'),
   'metadata',jsonb_build_object('series_memberships',coalesce(s->'metadata'->'series_memberships','[]'))) s
  from works where coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb
   or s->'work'->>'ao3_work_id' in (select id from series_work_ids)
 ), documents as materialized (
  select s,false is_series from works
  union all
  select story,true from public.library_series_results(coalesce((select jsonb_agg(s) from series_works),'[]'),true)
 ), shelves as (
  select k key,null::jsonb rules from unnest(array['all','currently_reading','paused_reading','to_read','finished','did_not_finish','series','recs','favorites']) k
  union all select id::text,automatic_rules from public.collections where user_id=(select auth.uid()) and default_key is null
 ), counts as (
  select key,
   count(d.s) filter(where not d.is_series and key<>'series') works,
   count(d.s) filter(where d.is_series) series,
   max(nullif(d.s->>'updated_at','')::timestamptz) filter(where coalesce(d.s->'collectionIds','[]') ? key) updated_at
  from shelves left join documents d on case when rules is not null then
   not d.is_series and public.automatic_collection_matches(d.s,rules)
   else key='all' or public.library_in_shelf(d.s,key,'library') end
  group by key
 ) select coalesce(jsonb_object_agg(key,jsonb_build_object('works',works,'series',series,'updated_at',updated_at)),'{}') from counts;
$navigation$;

revoke all on function public.library_series_results(jsonb,boolean) from public,anon;
grant execute on function public.library_series_results(jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
