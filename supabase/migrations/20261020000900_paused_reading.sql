begin;

-- Renaming the enum preserves existing statuses and saved chapter progress.
alter type public.reading_status rename value 'continue_later' to 'paused_reading';

do $migration$
declare signature regprocedure; definition text;
begin
 foreach signature in array array[
  'public.library_in_shelf(jsonb,text,text)'::regprocedure,
  'public.library_search_text(jsonb,text)'::regprocedure,
  'public.library_series_results(jsonb)'::regprocedure,
  'public.query_library(jsonb,integer,integer)'::regprocedure
 ] loop
  select pg_get_functiondef(signature) into definition;
  definition := replace(replace(definition, 'continue_later', 'paused_reading'), 'Continue Later', 'Paused Reading');
  -- Include paused works in the dashboard pool and its section counts.
  definition := replace(definition, $$'waiting_for_updates','to_read'$$, $$'waiting_for_updates','to_read','paused_reading'$$);
  definition := replace(definition, $$'waiting','to_read'$$, $$'waiting','to_read','paused_reading'$$);
  execute definition;
 end loop;
end;
$migration$;

commit;
