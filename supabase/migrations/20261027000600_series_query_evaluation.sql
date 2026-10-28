begin;

-- Reuse each series' merged works/metadata once. Without these boundaries the
-- planner can rebuild large preview JSON for every field in a card or predicate.
do $$ declare definition text; updated text; stage text; begin
 select pg_get_functiondef('public.library_series_results(jsonb,boolean)'::regprocedure) into definition;
 updated:=definition;
 foreach stage in array array['memberships','linked','candidates','groups','previews','aggregates'] loop
  if position(stage||' as (' in updated)=0 then raise exception 'Review series evaluation stage: %',stage; end if;
  updated:=replace(updated,stage||' as (',stage||' as materialized (');
 end loop;
 -- Materialization must preserve the compact navigation path: it never needs
 -- merged preview works or aggregated metadata just to count shelf statuses.
 updated:=replace(updated,'(select coalesce(jsonb_agg(w order by',
  'case when p_navigation then ''[]''::jsonb else (select coalesce(jsonb_agg(w order by');
 updated:=replace(updated,') works from groups g)',') end works from groups g)');
 updated:=replace(updated,'select p.*,jsonb_build_object(', 'select p.*,case when p_navigation then ''{}''::jsonb else jsonb_build_object(');
 updated:=replace(updated,'else preview->''wordCount'' end) m,','else preview->''wordCount'' end) end m,');
 if updated not like '%case when p_navigation then ''[]''::jsonb%' or updated not like '%end) end m,%' then raise exception 'Review compact series evaluation'; end if;
 execute updated;

 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$select s,null::jsonb payload,search_any,search_summary,search_notes from works union all select story,payload,public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch','')),public.library_normalize(story->'metadata'->>'summary'),public.library_normalize(story->>'notes') from series$old$,
  $new$select s,null::jsonb payload,search_any,search_summary,search_notes from works where coalesce(p_query->>'shelf','all')<>'series'
  union all select story,payload,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and coalesce(p_query->'filters'->>'scope','any') not in ('summary','notes') then public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch','')) end,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and p_query->'filters'->>'scope'='summary' then public.library_normalize(story->'metadata'->>'summary') end,
   case when coalesce(p_query->'terms','[]')<>'[]'::jsonb and p_query->'filters'->>'scope'='notes' then public.library_normalize(story->>'notes') end from series$new$);
 if updated=definition then raise exception 'Review series search payloads'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
