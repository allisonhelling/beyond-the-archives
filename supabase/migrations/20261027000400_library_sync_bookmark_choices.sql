begin;
-- Extend the existing listing transaction; CSV validation and version checking
-- remain authoritative and generated jobs still complete without AO3 requests.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.submit_ao3_library_sync(jsonb,uuid,text)'::regprocedure) into definition;
 updated:=replace(definition,
  'jsonb_build_object(''choice'',''keep'',''expectedVersion'',null)',
  'jsonb_build_object(''choice'',coalesce(value->>''choice'',''keep''),''expectedVersion'',value->>''expectedVersion'')');
 if updated=definition then raise exception 'Review library sync bookmark choices'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
