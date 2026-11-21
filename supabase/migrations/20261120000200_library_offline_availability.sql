begin;

-- Keep work matching, result counts, and facets on the same availability scope.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_candidate_predicate(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$
 if p_query->>'availability'='unfolded' then
  predicate:=predicate||$sql$ and exists(select 1 from public.reader_availability r
   join public.library_entries e on e.user_id=r.user_id join public.works w on w.id=e.work_id
   where r.user_id=$2 and e.id=d.id and r.works ? w.ao3_work_id::text)$sql$;
 elsif p_query->>'availability'='bookfusion' then
  predicate:=predicate||$sql$ and d.facet_story->>'bookfusion'='true'$sql$;
 end if;$old$,$new$
 declare
  unfolded text:=$sql$exists(select 1 from public.reader_availability r
   join public.library_entries e on e.user_id=r.user_id join public.works w on w.id=e.work_id
   where r.user_id=$2 and e.id=d.id and r.works ? w.ao3_work_id::text)$sql$;
  bookfusion text:=$sql$coalesce(d.facet_story->>'bookfusion'='true',false)$sql$;
 begin
  predicate:=predicate||case p_query->>'availability'
   when 'unfolded' then ' and '||unfolded
   when 'bookfusion' then ' and '||bookfusion
   when 'any-offline' then format(' and (%s or %s)',unfolded,bookfusion)
   when 'online-only' then format(' and not (%s or %s)',unfolded,bookfusion)
   else ''
  end;
 end;$new$);
 if updated=definition then raise exception 'Review offline availability scope'; end if;
 execute updated;
end $migration$;

delete from public.library_query_cache where query->>'availability' in ('any-offline','online-only');
notify pgrst,'reload schema';
commit;
