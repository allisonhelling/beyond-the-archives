begin;

-- Reader heartbeats update report freshness without changing library matches.
-- Keep revision invalidation for changed identities/downloads and insert/delete.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.sync_library_query_state()'::regprocedure) into definition;
 updated:=replace(definition,'if old_row=new_row then return null; end if;',$new$if old_row=new_row then return null; end if;
  if tg_table_name='reader_availability'
   and (old_row->'user_id',old_row->'installation_id') is not distinct from (new_row->'user_id',new_row->'installation_id')
   and (old_row->'works') @> (new_row->'works') and (new_row->'works') @> (old_row->'works') then return null; end if;$new$);
 if updated=definition then raise exception 'Review reader heartbeat invalidation'; end if;
 execute updated;
end $migration$;

-- Facets need tags, fandoms and shelf membership, rather than full prose and
-- chapter maps. Store their inputs alongside the existing compact projections.
create function public.library_facet_document(s jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'id',s->'id','reading_status',s->'reading_status','is_favorite',s->'is_favorite','is_rec',s->'is_rec',
  'collectionIds',s->'collectionIds','personalTags',s->'personalTags',
  'bookfusion',coalesce(s->'metadata'->'bookfusion_link'->>'kind' in ('book','bookmark')
   and s->'metadata'->'bookfusion_link'->>'url' ~ '^https://(www[.])?bookfusion[.]com/[^/?#[:space:]]',false),
  'metadata',jsonb_build_object('authors',s->'metadata'->'authors',
   'relationship_tags',s->'metadata'->'relationship_tags','character_tags',s->'metadata'->'character_tags',
   'additional_tags',s->'metadata'->'additional_tags','fandoms',s->'metadata'->'fandoms'));
$$;
alter table public.library_search_documents add column facet_story jsonb
 generated always as (public.library_facet_document(story)) stored;

-- Keep both existing pool signatures intact. Facets opt into the compact work
-- projection; page/filter callers retain their complete matching documents.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'p_payload boolean)','p_payload boolean, p_facets boolean)');
 updated:=replace(updated,'select d.story s,','select case when p_facets then d.facet_story else d.story end s,');
 updated:=replace(updated,$old$d.story->'metadata'->'authors'$old$, $new$d.facet_story->'metadata'->'authors'$new$);
 if updated=definition or updated not like '%p_facets boolean%' or updated not like '%then d.facet_story%' then
  raise exception 'Review compact facet pool projection';
 end if;
 execute updated;
end $migration$;
create or replace function public.library_query_pool(p_query jsonb,p_payload boolean)
returns table(s jsonb,payload jsonb,search_any text,search_summary text,search_notes text)
language plpgsql volatile set search_path='' set jit=off as $$
begin
 return query select * from public.library_query_pool(p_query,p_payload,false);
end;
$$;
revoke all on function public.library_query_pool(jsonb,boolean,boolean) from public,anon;
grant execute on function public.library_query_pool(jsonb,boolean,boolean) to authenticated;

-- Extend the shared candidate selector so pages, exact counts and suggestions
-- apply the same platform semantics. Old installation-specific links still work.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_candidate_predicate(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$d.story->'metadata'->'authors'$old$, $new$d.facet_story->'metadata'->'authors'$new$);
 updated:=replace(updated,' return predicate;',$new$
 if p_query->>'availability'='unfolded' then
  predicate:=predicate||$sql$ and exists(select 1 from public.reader_availability r
   join public.library_entries e on e.user_id=r.user_id join public.works w on w.id=e.work_id
   where r.user_id=$2 and e.id=d.id and r.works ? w.ao3_work_id::text)$sql$;
 elsif p_query->>'availability'='bookfusion' then
  predicate:=predicate||$sql$ and d.facet_story->>'bookfusion'='true'$sql$;
 end if;
 return predicate;$new$);
 if updated=definition or updated not like '%availability%' then raise exception 'Review platform candidate predicate'; end if;
 execute updated;
 select pg_get_functiondef('public.library_query_has_series(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'begin',E'begin\n if nullif(p_query->>''availability'','''') is not null then return false; end if;');
 if updated=definition then raise exception 'Review platform series selection'; end if;
 execute updated;
end $migration$;

-- Reuse the existing facet aggregation exactly, with compact pool inputs.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_facets(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'public.library_query_facets(', 'public.library_uncached_facets(');
 updated:=replace(updated,'public.library_query_pool(p_query,false)', 'public.library_query_pool(p_query,false,true)');
 if updated=definition or updated not like '%p_query,false,true%' then raise exception 'Review facet aggregation'; end if;
 execute updated;
end $migration$;
revoke all on function public.library_uncached_facets(jsonb) from public,anon,authenticated;

-- Results remain owner/revision scoped and use the same 20-entry cache budget.
-- Coalesce cold reads across tabs without changing the database timeout.
create or replace function public.library_query_facets(p_query jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' set jit=off as $$
declare owner_id uuid:=(select auth.uid()); version bigint; scope jsonb; signature text; cached record; result jsonb;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 scope:=jsonb_strip_nulls(jsonb_build_object('mode',p_query->>'mode',
  'shelf',case when p_query->>'mode'='reading' then 'view_all' else coalesce(p_query->>'shelf','all') end,
  'author',p_query->>'author','reader',p_query->>'reader','availability',p_query->>'availability',
  'filters',jsonb_build_object('showSeries',coalesce((p_query->'filters'->>'showSeries')::boolean,false))));
 signature:='facets:'||md5(scope::text);
 version:=public.library_revision();
 select * into cached from public.library_query_cache where user_id=owner_id and key=signature;
 if cached.revision=version and cached.query=scope then return cached.matches; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||signature,0));
 version:=public.library_revision();
 select * into cached from public.library_query_cache where user_id=owner_id and key=signature;
 if cached.revision=version and cached.query=scope then return cached.matches; end if;
 result:=public.library_uncached_facets(scope);
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':library-query-cache',0));
 insert into public.library_query_cache(user_id,key,query,revision,matches) values(owner_id,signature,scope,version,result)
 on conflict(user_id,key) do update set query=excluded.query,revision=excluded.revision,matches=excluded.matches,touched_at=clock_timestamp();
 delete from public.library_query_cache where user_id=owner_id and key in (
  select key from public.library_query_cache where user_id=owner_id order by touched_at desc,key offset 20);
 return result;
end $$;
revoke all on function public.library_query_facets(jsonb) from public,anon;
grant execute on function public.library_query_facets(jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
