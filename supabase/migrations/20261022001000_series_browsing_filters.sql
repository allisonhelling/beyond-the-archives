begin;

-- Extend the shared matcher so ordinary filters and automatic collections agree.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, $old$ (coalesce(f->>'query','')=''$old$, $new$
 (not coalesce((f->>'excludeLaterSeries')::boolean,false)
  or s->>'id' like 'series:%'
  or (select coalesce(bool_or(coalesce(m->'position'='1'::jsonb,false)),
    not exists(select 1 from jsonb_array_elements_text(coalesce(s->'metadata'->'series','[]')) name where btrim(name)<>''))
   from jsonb_array_elements(coalesce(s->'metadata'->'series_memberships','[]')) m
   where m->>'url'='https://archiveofourown.org/series/'||(m->>'id')
    and case when jsonb_typeof(m->'id')='number' then
     (m->>'id')::numeric between 1 and 9007199254740991 and trunc((m->>'id')::numeric)=(m->>'id')::numeric
    else false end))
 and (coalesce(f->>'query','')=''$new$);
 if updated=definition then raise exception 'Review first series installment filter'; end if;
 execute updated;

 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, '(''inSeries'',''favorites'',''personalNotes'',''recs'')', '(''inSeries'',''favorites'',''personalNotes'',''recs'',''showSeries'',''excludeLaterSeries'')');
 if updated=definition then raise exception 'Review series filter validation'; end if;
 execute updated;

 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 -- All Works can include series when explicitly requested, as other shelves can.
 updated:=replace(definition, $old$p_query->>'shelf'<>'all'$old$, $new$(p_query->>'shelf'<>'all' or coalesce((p_query->'filters'->>'showSeries')::boolean,false))$new$);
 updated:=replace(updated, 'pool as materialized (select * from documents where case when', $new$pool as materialized (select * from documents where
  (s->>'id' not like 'series:%' or p_query->>'mode'='series' or p_query->>'shelf'='series' or coalesce((p_query->'filters'->>'showSeries')::boolean,false)) and case when$new$);
 updated:=replace(updated, $old$else public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library') end$old$, $new$else (coalesce(p_query->>'shelf','all')='all' or public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library')) end$new$);
 if updated=definition or updated not like '%showSeries%' then raise exception 'Review series browsing visibility'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
