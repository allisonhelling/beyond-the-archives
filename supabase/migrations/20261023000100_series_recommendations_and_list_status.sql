begin;
alter table public.library_series add column is_rec boolean not null default false;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.update_library_series(bigint,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '(''favorite'',''collections'')', '(''favorite'',''rec'',''collections'')');
 updated:=replace(updated, '''favorite'',saved.is_favorite,', '''favorite'',saved.is_favorite,''rec'',saved.is_rec,');
 updated:=replace(updated, 'if jsonb_typeof(result->''merged''->''favorite'')', 'if jsonb_typeof(result->''merged''->''rec'') is distinct from ''boolean'' or jsonb_typeof(result->''merged''->''favorite'')');
 updated:=replace(updated, 'set is_favorite=', 'set is_rec=(result->''merged''->>''rec'')::boolean,is_favorite=');
 if updated=definition or updated not like '%saved.is_rec%' then raise exception 'Review series recommendation editing'; end if;
 execute updated;

 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, 'or is_favorite or', 'or is_favorite or is_rec or');
 updated:=replace(updated, '''is_favorite'',coalesce', '''is_rec'',coalesce((record->>''is_rec'')::boolean,false),''is_favorite'',coalesce');
 if updated=definition or updated not like '%''is_rec''%' then raise exception 'Review series recommendation filters'; end if;
 execute updated;

 -- Restore older backups that predate the personal series recommendation.
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition, 'if t=''metadata_jobs'' then', $hook$if t='library_series' then
   select coalesce(jsonb_agg(r||jsonb_build_object('is_rec',coalesce(nullif(r->'is_rec','null'::jsonb),'false'::jsonb))),'[]') into rows from jsonb_array_elements(rows) r;
  elsif t='metadata_jobs' then$hook$);
 if updated=definition then raise exception 'Review series backup compatibility'; end if;
 execute updated;

 -- The shared CSV importer skips existing works for listing scans. Apply the
 -- selected URL status before saving, so inferred bookmark dates never create
 -- a spurious Finished event for works imported as Paused or To Read.
 select pg_get_functiondef('public.submit_ao3_csv_works(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '  select coalesce(array_agg(c.collection_id)', $hook$
  if r ? 'importReadingStatus' then
   v_status:=(r->>'importReadingStatus')::public.reading_status;
   if v_status is null then raise exception 'Choose a reading status' using errcode='22023'; end if;
   progress:=case when v_status='finished' then coalesce((metadata->>'published_chapters')::integer,0) else 0 end;
  end if;
  select coalesce(array_agg(c.collection_id)$hook$);
 updated:=replace(updated, $old$finished_at=case when v_status='finished' then$old$,
  $new$finished_at=case when r ? 'importReadingStatus' and v_status='finished' then now() when v_status='finished' then$new$);
 if updated=definition or updated not like '%Choose a reading status%' then raise exception 'Review list reading status selection'; end if;
 execute updated;

 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $old$, 'reading') returning * into entry;$old$,
  $new$, coalesce((r->>'importReadingStatus')::public.reading_status,'reading')) returning * into entry;$new$);
 updated:=replace(updated, $old$public.save_library_story(entry.original_url,'{}','reading',0$old$,
  $new$public.save_library_story(entry.original_url,'{}',entry.reading_status,0$new$);
 if updated=definition or updated not like '%importReadingStatus%' then raise exception 'Review deleted-work list status selection'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
