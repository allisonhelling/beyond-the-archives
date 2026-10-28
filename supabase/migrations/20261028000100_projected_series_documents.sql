begin;

-- Extend the existing owner-scoped effective-document read model. The stored
-- projection is rebuilt atomically whenever story changes, including imports,
-- manual corrections, tags, reading progress and restore. Source overlays and
-- large chapter maps must never be reconstructed on a series browsing request.
create function public.library_series_input(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 return jsonb_build_object('id',s->'id','created_at',s->'created_at','personal_rating',s->'personal_rating','reading_status',s->'reading_status','last_read_chapter',s->'last_read_chapter','notes',s->'notes','personalTags',s->'personalTags','metadata',(s->'metadata')-'summary_html','work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at'));
end $$;
revoke all on function public.library_series_input(jsonb) from public,anon;
grant execute on function public.library_series_input(jsonb) to authenticated,service_role;

alter table public.library_search_documents
 add column series_story jsonb generated always as (public.library_series_input(story)) stored;

-- Keep series work context independent of full work-card documents. A Series
-- shelf never evaluates the full works CTE; mixed views still use it for cards.
-- Existing membership inference, mergers, filters and page projection remain
-- the single source of truth; this changes only their document inputs.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
 $old$ series as materialized (select * from public.library_series_results(coalesce((select jsonb_agg(jsonb_build_object('id',s->'id','created_at',s->'created_at','personal_rating',s->'personal_rating','reading_status',s->'reading_status','last_read_chapter',s->'last_read_chapter','notes',s->'notes','personalTags',s->'personalTags','metadata',(s->'metadata')-'summary_html','work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at'))) from works where series_requested and (coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb or s->'work'->>'ao3_work_id' in (select id from series_work_ids))),'[]')) where series_requested),$old$,
 $new$ series_inputs as materialized (
  select d.series_story s from candidates c join public.library_search_documents d on d.id=c.id
  where series_requested and d.user_id=(select auth.uid())
   and (coalesce(d.series_story->'metadata'->'series_memberships','[]')<>'[]'::jsonb
    or d.series_story->'work'->>'ao3_work_id' in (select id from series_work_ids))),
 series as materialized (select * from public.library_series_results(coalesce((select jsonb_agg(s) from series_inputs),'[]')) where series_requested),$new$);
 if updated=definition then raise exception 'Review stored series inputs'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
