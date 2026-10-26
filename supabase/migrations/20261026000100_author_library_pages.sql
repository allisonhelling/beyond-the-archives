begin;

-- Author pages use the existing account-owned search documents and pagination.
-- Scope before filtering so counts, suggestions, and fandoms stay within the author.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated := replace(definition,
  'from public.library_search_documents where user_id=(select auth.uid())',
  $hook$from public.library_search_documents where user_id=(select auth.uid())
   and (p_query->>'author' is null or story->'metadata'->'authors' @> jsonb_build_array(p_query->>'author'))$hook$);
 updated := replace(updated, 'series_requested:=', 'series_requested:=p_query->>''author'' is null and ');
 if updated=definition or updated not like '%jsonb_build_array(p_query->>''author'')%'
  or updated not like '%series_requested:=p_query->>''author'' is null and %' then
  raise exception 'Review author-scoped library query';
 end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
