begin;
-- Keep kudos in the existing automatic metadata layer, with the same fencing and
-- ownership boundaries as other AO3 observations. Unknown counts preserve data.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated := replace(definition, $old$  foreach k in array array['series','series_memberships'] loop$old$, $new$  if p_metadata ? 'kudos' and p_metadata->'kudos'<>'null'::jsonb then
   if jsonb_typeof(p_metadata->'kudos')<>'number' or (p_metadata->>'kudos') !~ '^[0-9]+$' then raise exception 'Invalid kudos count' using errcode='22023'; end if;
   if (p_metadata->>'kudos')::numeric>2147483647 then raise exception 'Invalid kudos count' using errcode='22023'; end if;
   update public.works set automatic_metadata=jsonb_set(automatic_metadata,'{kudos}',p_metadata->'kudos') where id=j.work_id;
  end if;
  foreach k in array array['series','series_memberships'] loop$new$);
 if updated=definition then raise exception 'Metadata boundary changed; review kudos migration'; end if;
 execute updated;
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $old$'rating','word_count','published_chapters'$old$, $new$'rating','kudos','word_count','published_chapters'$new$);
 updated:=replace(updated, $old$array['word_count','published_chapters','total_chapters']$old$, $new$array['word_count','published_chapters','total_chapters','kudos']$new$);
 if updated=definition then raise exception 'Userscript boundary changed; review kudos migration'; end if;
 execute updated;
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition, $old$array['published_chapters','total_chapters','word_count']$old$, $new$array['published_chapters','total_chapters','word_count','kudos']$new$);
 if updated=definition then raise exception 'Manual metadata boundary changed; review kudos migration'; end if;
 execute updated;
 -- Keep optional tile information in the existing paginated series projection.
 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$'title',s->'metadata'->'title','authors'$old$,
  $new$'kudos',coalesce(nullif(s->'metadata'->'kudos','null'::jsonb),p.w->'kudos'),
 'archiveWarnings',coalesce(nullif(s->'metadata'->'archive_warnings','null'::jsonb),p.w->'archiveWarnings','[]'::jsonb),
 'title',s->'metadata'->'title','authors'$new$);
 if updated=definition then raise exception 'Series projection changed; review kudos migration'; end if;
 execute updated;
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$'id',v->'id','reading_status',v->'reading_status'$old$,
  $new$'id',v->'id','personal_rating',v->'personal_rating','reading_status',v->'reading_status'$new$);
 if updated=definition then raise exception 'Series rating projection changed; review kudos migration'; end if;
 execute updated;
end $migration$;
commit;
