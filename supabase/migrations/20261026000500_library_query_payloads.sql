begin;

-- Ordinary browsing and facets do not search summary/notes text. Avoid copying
-- three large generated strings through every materialized pool and sort.
-- Full documents and the existing matcher remain the source of filter semantics.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
  'select d.story s,d.search_any,d.search_summary,d.search_notes',
  $new$select d.story s,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and coalesce(p_query->'filters'->>'scope','any') not in ('summary','notes') then d.search_any end search_any,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and p_query->'filters'->>'scope'='summary' then d.search_summary end search_summary,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and p_query->'filters'->>'scope'='notes' then d.search_notes end search_notes$new$);
 if updated=definition then raise exception 'Review library search payload projection'; end if;
 execute updated;
end $$;

-- These interactive reads should not pay LLVM compilation startup costs.
alter function public.library_query_pool(jsonb) set jit=off;
alter function public.library_query_facets(jsonb) set jit=off;
alter function public.query_library(jsonb,integer,integer) set jit=off;

-- Reuse the compact series path. Count manual memberships once, rather than
-- testing every large document against every manual collection.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_navigation()'::regprocedure) into definition;
 updated:=replace(definition, $old$ ), counts as (
  select key,
   count(d.s) filter(where not d.is_series and key<>'series') works,
   count(d.s) filter(where d.is_series) series,
   max(nullif(d.s->>'updated_at','')::timestamptz) filter(where coalesce(d.s->'collectionIds','[]') ? key) updated_at
  from shelves left join documents d on case when rules is not null then
   not d.is_series and public.automatic_collection_matches(d.s,rules)
   else key='all' or public.library_in_shelf(d.s,key,'library') end
  group by key
 )$old$,
 $new$ ), shelf_documents as materialized (
  select s,is_series,jsonb_build_object('id',s->'id','reading_status',s->'reading_status',
   'is_favorite',s->'is_favorite','is_rec',s->'is_rec') shelf_story from documents
 ), memberships as (
  select k.key,d.is_series,null::timestamptz updated_at
  from shelf_documents d cross join unnest(array['all','currently_reading','paused_reading','to_read','finished','did_not_finish','series','recs','favorites']) k(key)
  where k.key='all' or public.library_in_shelf(d.shelf_story,k.key,'library')
  union all
  select c.key,d.is_series,nullif(d.s->>'updated_at','')::timestamptz
  from documents d cross join lateral jsonb_array_elements_text(coalesce(d.s->'collectionIds','[]')) m(key)
  join shelves c on c.key=m.key and c.rules is null
  union all
  select c.key,false,null::timestamptz
  from shelves c join documents d on not d.is_series and c.rules is not null
   and public.automatic_collection_matches(d.s,c.rules)
 ), counts as (
  select c.key,
   count(m.key) filter(where not m.is_series and c.key<>'series') works,
   count(m.key) filter(where m.is_series) series,max(m.updated_at) updated_at
  from shelves c left join memberships m on m.key=c.key group by c.key
 )$new$);
 if updated=definition then raise exception 'Review navigation membership aggregation'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
