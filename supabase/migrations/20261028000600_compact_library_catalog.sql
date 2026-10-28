begin;

-- Catalog and navigation need identities and organization, not the large source
-- overlays, chapter maps, history or summary HTML in a full work document.
-- Extend the existing owner-private read model; its normal writes keep this
-- projection current atomically, just like series_story and the sort columns.
create function public.library_catalog_story(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 return jsonb_build_object('id',s->'id','work_id',s->'work_id',
  'work',jsonb_build_object('id',s->'work_id','ao3_work_id',s->'work'->'ao3_work_id'),
  'created_at',s->'created_at','updated_at',s->'updated_at','last_read_chapter',s->'last_read_chapter',
  'metadata',jsonb_build_object('title',s->'metadata'->'title','authors',s->'metadata'->'authors',
   'fandoms',s->'metadata'->'fandoms','series',s->'metadata'->'series',
   'series_memberships',s->'metadata'->'series_memberships','publication_status',s->'metadata'->'publication_status'),
  'source_bookmark',jsonb_build_object('rec',s->'source_bookmark'->'rec'),
  'is_rec',s->'is_rec','reading_status',s->'reading_status','is_favorite',s->'is_favorite','collectionIds',s->'collectionIds');
end $$;
revoke all on function public.library_catalog_story(jsonb) from public,anon;
grant execute on function public.library_catalog_story(jsonb) to authenticated,service_role;
alter table public.library_search_documents add column catalog_story jsonb
 generated always as (public.library_catalog_story(story)) stored;

-- Keep the existing catalog's collection/series contracts and owner scoping.
-- Automatic memberships are already indexed independently of display metadata.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_catalog()'::regprocedure) into definition;
 updated:=regexp_replace(definition,
  $pattern$jsonb_agg\(jsonb_build_object\('id',id,'work_id',work_id,.*?public\.automatic_collection_ids\(story,user_id\)\)\)$pattern$,
  $new$jsonb_agg(catalog_story||jsonb_build_object('automaticCollectionIds',public.automatic_collection_ids(catalog_story,user_id)))$new$,'s');
 if updated=definition or updated like '%story->%' then raise exception 'Review compact catalog projection'; end if;
 execute updated;

 -- Navigation retains the shared shelf matcher and compact series merger. Its
 -- unfiltered work context can read the same compact column directly instead
 -- of materializing full cards through the browsing query pool.
 select pg_get_functiondef('public.library_navigation_counts()'::regprocedure) into definition;
 updated:=replace(definition,
  $old$select s from public.library_query_pool('{"mode":"library","shelf":"all","filters":{"showSeries":false}}')$old$,
  $new$select catalog_story s from public.library_search_documents where user_id=(select auth.uid())$new$);
 updated:=replace(updated,
  $old$coalesce(s->'metadata'->'series_memberships','[]')$old$,
  $new$coalesce(nullif(s->'metadata'->'series_memberships','null'::jsonb),'[]')$new$);
 if updated=definition or updated not like '%select catalog_story s from public.library_search_documents%'
  or updated like '%from public.library_query_pool%' then raise exception 'Review compact navigation work context'; end if;
 execute updated;

 -- Filter candidates on the small projection before fetching the larger series
 -- inputs. Most saved works do not participate in a series; their summaries and
 -- categorized tags should not be decoded just to test membership.
 select pg_get_functiondef('public.library_cached_series(boolean)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$coalesce(d.series_story->'metadata'->'series_memberships','[]')$old$,
  $new$coalesce(nullif(d.catalog_story->'metadata'->'series_memberships','null'::jsonb),'[]')$new$);
 updated:=replace(updated, 'or d.series_story->', 'or d.catalog_story->');
 if updated=definition or updated not like '%select d.series_story s%'
  or updated not like '%coalesce(nullif(d.catalog_story->%'
  or updated not like '%or d.catalog_story->%' then raise exception 'Review compact series candidate selection'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
