begin;

-- The same nonempty observation rule applies to listing imports and work refreshes.
-- False and zero carry information; missing/blank fields do not erase saved data.
create function public.nonempty_ao3_metadata(p_metadata jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) ||
  case when jsonb_typeof(p_metadata->'is_complete')='boolean' then jsonb_build_object('publication_status',case when (p_metadata->>'is_complete')::boolean then 'complete' else 'in_progress' end) else '{}'::jsonb end
 from jsonb_each(p_metadata)
 where value not in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
 and (jsonb_typeof(value)<>'string' or length(trim(value#>>'{}'))>0)
$$;
revoke all on function public.nonempty_ao3_metadata(jsonb) from public,anon,authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.submit_ao3_csv_import(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'collections uuid[]; wid bigint;','collections uuid[]; wid bigint; saved_overrides jsonb;');
 updated:=replace(updated,'  if entry.id is not null and (r->>''source''=', $hook$
  if jsonb_typeof(r->'metadata') is distinct from 'object' or coalesce(length(trim(r->'metadata'->>'title')),0)=0 then raise exception 'CSV title is required'; end if;
  r:=jsonb_set(r,'{metadata}',public.nonempty_ao3_metadata(r->'metadata'));
  if entry.id is not null and (r->>'source'=$hook$);
 updated:=replace(updated,'then kept:=kept+1; continue; end if;', $hook$then
   update public.library_entries set extension_metadata=extension_metadata || (r->'metadata')
    where id=entry.id and extension_metadata is distinct from extension_metadata || (r->'metadata');
   kept:=kept+1; continue;
  end if;$hook$);
 updated:=replace(updated, $old$metadata || jsonb_build_object('publication_status',case when metadata->>'is_complete'='true' then 'complete' when metadata ? 'is_complete' then 'in_progress' else 'unknown' end)$old$, 'metadata');
 updated:=replace(updated,'  metadata:=r->''metadata'';','  metadata:=r->''metadata''; saved_overrides:=entry.metadata_overrides;');
 -- save_library_story validates source metadata using its existing shared boundary.
 -- Restore manual corrections afterwards; choosing a bookmark only replaces personal fields.
 updated:=replace(updated,'metadata_overrides=metadata_overrides-array(select jsonb_object_keys(metadata))-''publication_status'',
   finished_at=', 'metadata_overrides=saved_overrides,
   finished_at=');
 if updated=definition or updated not like '%saved_overrides:=entry.metadata_overrides%' or updated not like '%metadata_overrides=saved_overrides,%' then raise exception 'Review listing refresh integration'; end if;
 execute updated;

 select pg_get_functiondef('public.preview_ao3_csv_import(bigint[])'::regprocedure) into definition;
 updated:=replace(definition,'''progress'',e.last_read_chapter,','''finishedAt'',e.finished_at,''progress'',e.last_read_chapter,');
 if updated=definition then raise exception 'Review bookmark preview'; end if;
 execute updated;

 -- Preserve optional statistics in every existing metadata validation boundary.
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition,'''word_count'',''kudos'']','''word_count'',''kudos'',''bookmark_count'',''comment_count'',''hits'']');
 if updated=definition then raise exception 'Review statistics validation'; end if;
 execute updated;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, '  -- User-controlled browser snapshots stay private;', '  p_metadata:=public.nonempty_ao3_metadata(p_metadata);
  -- User-controlled browser snapshots stay private;');
 -- The existing numeric validation is reused for all AO3 statistics.
 updated:=replace(updated, '  if p_metadata ? ''kudos'' and p_metadata->''kudos''<>''null''::jsonb then', '  foreach k in array array[''kudos'',''bookmark_count'',''comment_count'',''hits''] loop
  if p_metadata ? k and p_metadata->k<>''null''::jsonb then');
 updated:=replace(updated, 'jsonb_typeof(p_metadata->''kudos'')', 'jsonb_typeof(p_metadata->k)');
 updated:=replace(updated, '(p_metadata->>''kudos'')', '(p_metadata->>k)');
 updated:=replace(updated, '''{kudos}'',p_metadata->''kudos''', 'array[k],p_metadata->k');
 updated:=replace(updated, '  foreach k in array array[''series'',''series_memberships''] loop', '  end loop;
  foreach k in array array[''series'',''series_memberships''] loop');
 if updated=definition then raise exception 'Review work metadata refresh'; end if;
 execute updated;
end $migration$;
notify pgrst,'reload schema';
commit;
