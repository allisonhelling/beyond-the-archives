begin;
-- Extend existing metadata boundaries for language and companion statistics.
-- Worker statistics already reuse the shared numeric validation.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated := replace(definition, $old$  foreach k in array array['series','series_memberships','summary_html'] loop$old$, $new$  if p_metadata ? 'language' and (jsonb_typeof(p_metadata->'language')<>'string' or length(p_metadata->>'language')>200) then raise exception 'Invalid AO3 language' using errcode='22023'; end if;
  foreach k in array array['series','series_memberships','summary_html','language'] loop$new$);
 if updated=definition then raise exception 'Review complete AO3 metadata import boundary'; end if;
 execute updated;

 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, $old$'rating','kudos','word_count'$old$, $new$'language','rating','kudos','bookmark_count','comment_count','hits','word_count'$new$);
 updated := replace(updated, $old$array['title','summary','summary_html','rating'$old$, $new$array['title','summary','summary_html','language','rating'$new$);
 updated := replace(updated, $old$array['word_count','published_chapters','total_chapters','kudos']$old$, $new$array['word_count','published_chapters','total_chapters','kudos','bookmark_count','comment_count','hits']$new$);
 if updated=definition then raise exception 'Review complete AO3 metadata companion boundary'; end if;
 execute updated;

 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated := replace(definition, $old$array['title','summary','rating','publication_status']$old$, $new$array['title','summary','language','rating','publication_status']$new$);
 if updated=definition then raise exception 'Review complete AO3 metadata save boundary'; end if;
 execute updated;
end;
$migration$;
commit;
