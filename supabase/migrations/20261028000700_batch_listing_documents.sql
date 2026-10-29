begin;

-- CSV and scan imports share this boundary. Their per-work saves, bookmark
-- observations and reading proposals must finish before projecting documents.
-- Reuse the metadata worker's existing transaction-local accumulator and flush.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.submit_ao3_csv_import(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'state jsonb; review jsonb;',
  'state jsonb; review jsonb; previous_defer text:=current_setting(''app.defer_library_documents'',true);');
 updated:=replace(updated,' for r in select value from jsonb_array_elements(p_rows) order by',
  ' perform set_config(''app.defer_library_documents'',''on'',true);
 for r in select value from jsonb_array_elements(p_rows) order by');
 updated:=replace(updated,' return result||jsonb_build_object(''metadataRepaired'',',
  ' if previous_defer is distinct from ''on'' then
  perform public.flush_library_documents();
  perform set_config(''app.defer_library_documents'',coalesce(previous_defer,''''),true);
 end if;
 return result||jsonb_build_object(''metadataRepaired'',');
 if updated=definition or updated not like '%previous_defer text:=%'
  or updated not like '%perform set_config(''app.defer_library_documents'',''on'',true)%'
  or updated not like '%perform public.flush_library_documents()%' then
  raise exception 'Review listing document batching';
 end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
