begin;

-- Only automatically inferred groups require multiple saved works. Records
-- retained by the existing saved-series rules keep their pages independently.
-- Filter at the shared grouping boundary before preview/metadata aggregation so
-- pages, facets and navigation counts use the same eligible series identities.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_results(jsonb,boolean,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$left join saved_groups g on g.sid=c.sid),$old$,
  $new$left join saved_groups g on g.sid=c.sid
 where r.id is not null or jsonb_array_length(coalesce(g.saved,'[]'::jsonb))>1),$new$);
 if updated=definition then raise exception 'Review inferred series grouping'; end if;
 execute updated;
end $$;

-- Existing pools and navigation snapshots were built under the old eligibility
-- rule. Reuse their normal revision invalidation rather than retaining them.
select public.invalidate_library_queries(user_id) from public.library_query_state;
notify pgrst,'reload schema';
commit;
