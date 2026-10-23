begin;

-- Keep plain summaries for editing/search and store formatting in the existing
-- automatic JSON layers. No HTML is trusted by the browser renderer.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated := replace(definition, 'array[''series'',''series_memberships'']', 'array[''series'',''series_memberships'',''summary_html'']');
 if updated=definition then raise exception 'Review formatted summary import boundary'; end if;
 execute updated;

 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, 'array[''title'',''summary'',''authors''', 'array[''title'',''summary'',''summary_html'',''authors''');
 updated := replace(updated, 'array[''title'',''summary'',''rating''', 'array[''title'',''summary'',''summary_html'',''rating''');
 if updated=definition then raise exception 'Review formatted summary companion boundary'; end if;
 execute updated;

end;
$$;

commit;
