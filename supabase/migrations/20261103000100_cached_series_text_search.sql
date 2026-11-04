begin;

-- Extend the existing owner/revision cache lazily: facets and ordinary browsing
-- must not normalize every installment summary just to display series counts.
create function public.library_series_search_document(s jsonb,p_scope text) returns jsonb
language sql immutable set search_path='' as $$
 select public.library_series_search_document(s)||case when p_scope in ('any','summary','notes') then
 jsonb_build_object('normalizedSearch'||initcap(p_scope),public.library_normalize(case p_scope
 when 'summary' then coalesce(s->'metadata'->>'summary','')
 when 'notes' then coalesce(s->>'notes','')
 else public.library_search_text(s,'any')||coalesce(s->>'extraSearch','') end)) else '{}'::jsonb end;
$$;
revoke all on function public.library_series_search_document(jsonb,text) from public,anon;
grant execute on function public.library_series_search_document(jsonb,text) to authenticated,service_role;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_cached_series(boolean)'::regprocedure) into definition;
 updated:=replace(definition,'library_cached_series(p_payload boolean DEFAULT true)', 'library_cached_series(p_payload boolean, p_scope text)');
 updated:=replace(updated,'if cached.revision=version then', $new$if cached.revision=version then
  if p_scope in ('any','summary','notes') and exists(select 1 from jsonb_array_elements(cached.matches) v
    where not (v->'story' ? ('normalizedSearch'||initcap(p_scope)))) then
   select coalesce(jsonb_agg(v||jsonb_build_object('story',public.library_series_search_document(v->'story',p_scope)) order by n),'[]') into cached.matches
    from jsonb_array_elements(cached.matches) with ordinality entries(v,n);
   update public.library_query_cache set matches=cached.matches where user_id=owner_id and key='series-pool';
  end if;$new$);
 updated:=replace(updated,'public.library_series_search_document(story)', 'public.library_series_search_document(story,p_scope)');
 if updated=definition or updated not like '%p_scope text%' or updated not like '%normalizedSearch%' then raise exception 'Review lazy series text cache'; end if;
 execute updated;
end $$;
revoke all on function public.library_cached_series(boolean,text) from public,anon;
grant execute on function public.library_cached_series(boolean,text) to authenticated,service_role;
create or replace function public.library_cached_series(p_payload boolean default true)
returns table(story jsonb,payload jsonb) language sql volatile security definer set search_path='' set jit=off as $$
 select * from public.library_cached_series(p_payload,null);
$$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'public.library_cached_series(p_payload)',
  $new$public.library_cached_series(p_payload,case when coalesce(p_query->'terms','[]')<>'[]'::jsonb then coalesce(p_query->'filters'->>'scope','any') end)$new$);
 updated:=replace(updated,
  $old$public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch',''))$old$,
  $new$coalesce(story->>'normalizedSearchAny',public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch','')))$new$);
 updated:=replace(updated,$old$public.library_normalize(story->'metadata'->>'summary')$old$,
  $new$coalesce(story->>'normalizedSearchSummary',public.library_normalize(story->'metadata'->>'summary'))$new$);
 updated:=replace(updated,$old$public.library_normalize(story->>'notes')$old$,
  $new$coalesce(story->>'normalizedSearchNotes',public.library_normalize(story->>'notes'))$new$);
 if updated=definition then raise exception 'Review cached series full-text projection'; end if;
 execute updated;
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,$old$s-'normalizedQueryText'$old$,
  $new$s-'normalizedSearchAny'-'normalizedSearchSummary'-'normalizedSearchNotes'-'normalizedQueryText'$new$);
 if updated=definition then raise exception 'Review private series text projection'; end if;
 execute updated;
end $$;
delete from public.library_query_cache;
notify pgrst,'reload schema';
commit;
