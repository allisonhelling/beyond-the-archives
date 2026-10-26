begin;

-- Keep the shared pagination/filtering pipeline, but avoid preparing hidden
-- series and every automatic membership before deciding which page to return.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,'declare result jsonb;',
  'declare result jsonb; series_requested boolean; collection_rules jsonb;');
 updated:=replace(updated,' with works as materialized', $hook$
 series_requested:=coalesce(p_query->>'mode'<>'reading',false) and
  (coalesce(p_query->>'mode'='series',false) or coalesce(p_query->>'shelf'='series',false)
   or coalesce((p_query->'filters'->>'showSeries')::boolean,false));
 select c.automatic_rules into collection_rules from public.collections c
 where c.user_id=(select auth.uid()) and c.id::text=p_query->>'shelf';
 with works as materialized$hook$);
 updated:=replace(updated,'from public.library_collection_documents','from public.library_search_documents');
 updated:=replace(updated,
  $old$p_query->>'mode'<>'reading' and (p_query->>'shelf'<>'all' or coalesce((p_query->'filters'->>'showSeries')::boolean,false))$old$,
  'series_requested');
 -- Only the chosen automatic collection participates in filtering. All other
 -- automatic memberships are display data and can wait until after pagination.
 updated:=replace(updated,
  $old$else (coalesce(p_query->>'shelf','all')='all' or public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library')) end$old$,
  $new$else case when collection_rules is not null then
   s->>'id' not like 'series:%' and public.automatic_collection_matches(s,collection_rules)
   else (coalesce(p_query->>'shelf','all')='all' or public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library')) end end$new$);
 updated:=replace(updated,'page as (select ordered.*','page_entries as (select ordered.*');
 updated:=replace(updated,
  $old$order by n)
 select jsonb_build_object('total'$old$,
  $new$order by n),
 page as materialized (select s || case when payload is null then
  jsonb_build_object('automaticCollectionIds',public.automatic_collection_ids(s,(select auth.uid())))
  else '{}'::jsonb end s,payload,n from page_entries)
 select jsonb_build_object('total'$new$);
 if updated=definition or updated like '%public.library_collection_documents%'
  or updated like '%p_query->>''shelf''<>''all''%'
  or updated not like '%page as materialized%'
  or updated not like '%public.automatic_collection_matches(s,collection_rules)%' then
  raise exception 'Review paginated collection query work';
 end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
