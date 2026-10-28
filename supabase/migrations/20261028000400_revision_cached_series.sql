begin;

-- Reuse the existing owner-private, revision-bound query cache. One shared
-- merged series pool serves all collection, filter and sort combinations until
-- an effective work/series/collection change advances the existing revision.
create function public.library_cached_series(p_payload boolean default true)
returns table(story jsonb,payload jsonb)
language plpgsql volatile security definer set search_path='' set jit=off as $$
#variable_conflict use_column
declare owner_id uuid:=(select auth.uid()); version bigint; cached record;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':library-series-cache',0));
 version:=public.library_revision();
 select * into cached from public.library_query_cache where user_id=owner_id and key='series-pool';
 if cached.revision=version then
  return query select v->'story',case when p_payload then nullif(v->'payload','null'::jsonb) end
   from jsonb_array_elements(cached.matches) v;
  return;
 end if;
 if p_payload then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':library-query-cache',0));
 end if;
 return query
 with series_work_ids as materialized (
  select distinct w->>'workId' id from public.library_series r
   cross join lateral jsonb_array_elements(r.metadata->'works') w where r.user_id=owner_id
 ), inputs as materialized (
  select d.series_story s from public.library_search_documents d where d.user_id=owner_id
   and (coalesce(d.series_story->'metadata'->'series_memberships','[]')<>'[]'::jsonb
    or d.series_story->'work'->>'ao3_work_id' in (select id from series_work_ids))
 ), merged as materialized (
  select * from public.library_series_results(coalesce((select jsonb_agg(s) from inputs),'[]'),false,true,p_payload)
 ), cache_write as (
  insert into public.library_query_cache(user_id,key,query,revision,matches)
  select owner_id,'series-pool','{"kind":"series-pool"}'::jsonb,version,
   coalesce(jsonb_agg(jsonb_build_object('story',r.story,'payload',r.payload)),'[]') from merged r having p_payload
  on conflict(user_id,key) do update set query=excluded.query,revision=excluded.revision,matches=excluded.matches,touched_at=clock_timestamp()
  returning 1
 )
 select r.story,r.payload from merged r;
 -- Cold facets skip card construction and cache writes. Returning the merged
 -- rows directly avoids re-decoding the complete cache JSON on a cold page.
 if p_payload then
  delete from public.library_query_cache where user_id=owner_id and key in (
   select key from public.library_query_cache where user_id=owner_id order by touched_at desc,key offset 20);
 end if;
end $$;
revoke all on function public.library_cached_series(boolean) from public,anon;
grant execute on function public.library_cached_series(boolean) to authenticated;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb,boolean)'::regprocedure) into definition;
 updated:=regexp_replace(definition,
  ' series_work_ids as materialized \(.*? documents as materialized \(',
  ' series as materialized (select * from public.library_cached_series(p_payload) where series_requested),
 documents as materialized (','s');
 if updated=definition or updated like '%from series_inputs%' then raise exception 'Review revision-cached series pool'; end if;
 execute updated;
end $$;
-- These RPC paths can populate the private derived cache. PostgREST must use a
-- read/write transaction, as it already does for work matches and navigation.
alter function public.library_query_pool(jsonb,boolean) volatile;
alter function public.library_query_pool(jsonb) volatile;
alter function public.library_query_series_matches(jsonb,jsonb,integer,integer) volatile;
alter function public.library_query_series_matches(jsonb,jsonb) volatile;
alter function public.library_query_facets(jsonb) volatile;
notify pgrst,'reload schema';
commit;
