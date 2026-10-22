begin;

-- Inferred series have no personal library_series row. jsonb_build_object
-- represents that absence as JSON null, which cannot use the deletion operator.
-- Convert it to SQL NULL before stripping metadata, preserving record: null.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated := replace(definition,
  $old$(payload->'record')-'metadata'$old$,
  $new$nullif(payload->'record','null'::jsonb)-'metadata'$new$);
 if updated=definition then raise exception 'Review inferred series record projection'; end if;
 execute updated;
end;
$$;

commit;
