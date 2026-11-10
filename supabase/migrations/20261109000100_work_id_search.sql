begin;
-- Extend the common filter so indexed pages and local/saved collection queries agree.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated := replace(definition,
  $old$coalesce(s->>'normalizedQueryText',public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]')))))$old$,
  $new$concat_ws(E'\n',coalesce(s->>'normalizedQueryText',public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]'))))),s->'work'->>'ao3_work_id')$new$);
 if updated = definition then raise exception 'Review work ID search filter'; end if;
 execute updated;
end $$;
-- Query identities are revision-cached; discard matches created before ID search.
delete from public.library_query_cache;
notify pgrst,'reload schema';
commit;
