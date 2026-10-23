begin;

-- AO3 seeds the personal choice once. Later source observations never replace it.
alter table public.library_entries add column is_rec boolean not null default false;
update public.library_entries set is_rec=coalesce(source_bookmark->'rec'='true'::jsonb,false);

do $$ declare definition text; updated text; signature text; begin
 select pg_get_functiondef('public.library_edit_snapshot(uuid)'::regprocedure) into definition;
 updated:=replace(definition, '''favorite'',e.is_favorite,', '''favorite'',e.is_favorite,''rec'',e.is_rec,');
 if updated=definition then raise exception 'Review Rec edit snapshot'; end if;
 execute updated;

 select pg_get_functiondef('public.update_library_entry_checked(uuid,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '(''status'',''progress'',''notes'',''rating'',''favorite'')', '(''status'',''progress'',''notes'',''rating'',''favorite'',''rec'')');
 updated:=replace(updated, ' is_favorite=(edits->>''favorite'')::boolean', ' is_rec=(edits->>''rec'')::boolean,is_favorite=(edits->>''favorite'')::boolean');
 updated:=replace(updated, ' saved:=public.library_edit_snapshot(p_id);', $hook$
 if p_input ? 'rec' and jsonb_typeof(p_input->'rec') is distinct from 'boolean' then raise exception 'Invalid Rec status' using errcode='22023'; end if;
 saved:=public.library_edit_snapshot(p_id);$hook$);
 if updated=definition or updated not like '%Invalid Rec status%' then raise exception 'Review editable Rec boundary'; end if;
 execute updated;

 -- Only rows created by this import receive an initial Rec choice.
 select pg_get_functiondef('public.submit_ao3_csv_import(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '  -- Source observations must not invalidate', $hook$
  if batch is not null then
   update public.library_entries e set is_rec=coalesce((r->>'bookmarkRec')::boolean,e.source_bookmark->'rec'='true'::jsonb,false)
    from public.import_items i where i.batch_id=batch and i.result='imported' and i.entry_id=e.id and i.ao3_work_id=(r->>'workId')::bigint;
  end if;
  -- Source observations must not invalidate$hook$);
 if updated=definition then raise exception 'Review first-import Rec initialization'; end if;
 execute updated;

 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, ' return created or', $hook$
 if created then update public.library_entries set is_rec=coalesce(source->'rec'='true'::jsonb,false) where id=entry.id; end if;
 return created or$hook$);
 if updated=definition then raise exception 'Review deleted bookmark Rec initialization'; end if;
 execute updated;

 foreach signature in array array['public.library_filter(jsonb,jsonb,jsonb,text)','public.library_in_shelf(jsonb,text,text)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition, $old$s->'source_bookmark'->'rec'='true'::jsonb$old$, $new$s->'is_rec'='true'::jsonb$new$);
  if updated=definition then raise exception 'Review personal Rec filtering: %',signature; end if;
  execute updated;
 end loop;

 select pg_get_functiondef('public.library_catalog()'::regprocedure) into definition;
 updated:=replace(definition, '''reading_status'',story->''reading_status''', '''is_rec'',story->''is_rec'',''reading_status'',story->''reading_status''');
 if updated=definition then raise exception 'Review personal Rec catalog'; end if;
 execute updated;

 -- Old JSON backups predate is_rec. Explicit saved choices always take precedence.
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition, $old$jsonb_set(r,'{reading_history}',coalesce(nullif(r->'reading_history','null'::jsonb),'[]'::jsonb))$old$,
  $new$jsonb_set(r,'{reading_history}',coalesce(nullif(r->'reading_history','null'::jsonb),'[]'::jsonb))||jsonb_build_object('is_rec',coalesce(nullif(r->'is_rec','null'::jsonb),to_jsonb(case when coalesce(r->'source_bookmark','{}'::jsonb) ? 'rec' then coalesce(r->'source_bookmark'->'rec'='true'::jsonb,false) else coalesce(r->'source_bookmark'->>'status','') ~ '(^|\s)rec(\s|$)' end)))$new$);
 if updated=definition then raise exception 'Review legacy Rec backup compatibility'; end if;
 execute updated;
end $$;

select public.refresh_library_documents(array(select id from public.library_entries));
notify pgrst,'reload schema';
commit;
