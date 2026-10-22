begin;

-- AO3 previews may have no update date. Match seriesSearchStory's handling of
-- empty dates so sorting/filtering mixed collections cannot cast T00:00:00Z.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated := replace(definition,
  $old$case when preview->>'updated' is not null then preview->>'updated'||'T00:00:00Z' else null end$old$,
  $new$case when nullif(trim(preview->>'updated'),'') is not null then trim(preview->>'updated')||'T00:00:00Z' else null end$new$);
 if updated=definition then raise exception 'Review series update date projection'; end if;
 execute updated;
end;
$$;

commit;
