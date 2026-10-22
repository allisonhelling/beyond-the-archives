begin;

-- Extend the existing status/shelf projections rather than introduce another
-- membership system. Paused stories retain their saved chapter progress.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 updated := replace(definition,
  $old$when 'to_read' then s->>'reading_status'='to_read'$old$,
  $new$when 'continue_later' then s->>'reading_status'='continue_later'
 when 'to_read' then s->>'reading_status'='to_read'$new$);
 if updated=definition then raise exception 'Review Continue Later shelf projection'; end if;
 execute updated;

 select pg_get_functiondef('public.library_search_text(jsonb,text)'::regprocedure) into definition;
 updated := replace(definition,
  $old$when 'reading' then 'Reading'$old$,
  $new$when 'reading' then 'Reading' when 'continue_later' then 'Continue Later'$new$);
 if updated=definition then raise exception 'Review Continue Later search label'; end if;
 execute updated;

 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated := replace(definition,
  $old$when not exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'<>'finished') then 'finished'$old$,
  $new$when exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status' in ('reading','re_reading','waiting_for_updates')) then 'reading'
 when exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'='continue_later') then 'continue_later'
 when not exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'<>'finished') then 'finished'$new$);
 if updated=definition then raise exception 'Review paused series projection'; end if;
 execute updated;
end;
$$;

commit;
