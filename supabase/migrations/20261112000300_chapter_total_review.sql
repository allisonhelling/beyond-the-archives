begin;
create function public.entry_chapter_metadata(e public.library_entries) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('published_chapters',w.published_chapters,'total_chapters',w.total_chapters,
  'publication_status',case when w.is_complete then 'complete' when w.is_complete=false then 'in_progress' else 'unknown' end)
  ||w.automatic_metadata||e.extension_metadata||e.metadata_overrides from public.works w where w.id=e.work_id;
$$;
revoke all on function public.entry_chapter_metadata(public.library_entries) from public,anon,authenticated;

-- Preserve unknown legacy counts. Only an explicit reduction review can reduce
-- progress while editing its denominator; history is never removed here.
create function public.review_chapter_total() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; effective jsonb; published integer; old_published integer; choice text:=nullif(current_setting('app.chapter_choice',true),''); origin text;
begin
 perform set_config('app.requested_reading_status',new.reading_status::text,true);
 effective:=public.entry_chapter_metadata(new); published:=(effective->>'published_chapters')::integer;
 if tg_op='UPDATE' then
  prior:=public.entry_chapter_metadata(old); old_published:=(prior->>'published_chapters')::integer;
  origin:=old.reading_provenance->>'statusOrigin';
  if published is distinct from old_published then
   if published>0 and published<old.last_read_chapter then
    if choice is distinct from 'reduce' or new.last_read_chapter<>published then
     raise exception 'Review Chapter Progress: the new total is below current progress. Explicitly confirm reducing current progress; history will be retained.' using errcode='22023';
    end if;
   end if;
   if (old_published is null or published>old_published) and published>old.last_read_chapter and old.reading_status='finished' and origin is distinct from 'derived'
    and current_setting('app.chapter_edit',true)='true' then
    if choice is null or choice not in ('keep_read','read_all','keep_finished') then raise exception 'Review Finished Status: keep current progress, confirm all chapters read, or keep Finished as a manual override' using errcode='22023'; end if;
    if choice='keep_read' and (new.last_read_chapter<>old.last_read_chapter or new.reading_status<>'reading')
     or choice='read_all' and (new.last_read_chapter<>published or new.reading_status<>'finished')
     or choice='keep_finished' and (new.last_read_chapter<>old.last_read_chapter or new.reading_status<>'finished') then raise exception 'Chapter review no longer matches the saved reading state' using errcode='22023'; end if;
   elsif published>new.last_read_chapter and origin='derived' and new.reading_status in ('finished','waiting_for_updates') and coalesce(current_setting('app.reading_intent',true),'preserve')<>'explicit' then new.reading_status:='reading'; end if;
  end if;
 end if;
 if current_setting('app.reading_intent',true)='derived' and new.reading_status='finished'
  and effective->>'publication_status' is distinct from 'complete' and coalesce(new.metadata_overrides->>'publication_status','') not in ('abandoned','deleted') then
  new.reading_status:=case when effective->>'publication_status' in ('in_progress','hiatus') then 'waiting_for_updates'::public.reading_status else 'reading'::public.reading_status end;
 end if;
 if new.source_url is not null and published is not null and published not between 1 and 100000 and (tg_op='INSERT' or published is distinct from old_published) then raise exception 'Enter 1–100,000 published chapters, or preserve an unknown count' using errcode='22023'; end if;
 -- Known denominators constrain current progress even when metadata comes from
 -- the browser/shared layer. No reader-state exception silently clamps a count.
 if published>0 and new.last_read_chapter>published and
  (new.source_url is not null or tg_op='UPDATE' and published is distinct from old_published) then
  raise exception 'Progress exceeds published chapters; review current progress before saving' using errcode='22023';
 end if;
 if new.metadata_overrides ? 'chapter_count_manual' and jsonb_typeof(new.metadata_overrides->'chapter_count_manual')<>'boolean' then raise exception 'Invalid chapter count confirmation' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function public.review_chapter_total() from public,anon,authenticated;
create trigger u_review_chapter_total before insert or update on public.library_entries for each row execute function public.review_chapter_total();

-- New universal sources use publication-aware derivation; abandonment/deletion
-- are terminal only as private user declarations, for every source.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition, $patch$if m->>'publication_status' = 'abandoned' then$patch$, $patch$if m->>'publication_status' = 'abandoned' and new.reading_status not in ('did_not_finish','paused_reading') then$patch$);
 updated:=replace(updated,'published > total','(published > total and new.source_url is null and not (tg_op=''UPDATE'' and m->''total_chapters'' is not distinct from old.metadata_overrides->''total_chapters''))');
 updated:=replace(updated,'new.last_read_chapter > total','(published is null and new.last_read_chapter > total)');
 updated:=replace(updated, '  return new;', $new$
  if new.source_url is not null and new.reading_status in ('reading','waiting_for_updates') then
   declare effective jsonb:=public.entry_chapter_metadata(new); count integer; begin
    count:=(effective->>'published_chapters')::integer;
    if count>0 and new.last_read_chapter=count then
     if effective->>'publication_status'='complete' or m->>'publication_status' in ('abandoned','deleted') then new.reading_status:='finished';
     elsif effective->>'publication_status' in ('in_progress','hiatus') then new.reading_status:='waiting_for_updates';
     else new.reading_status:='reading'; end if;
    end if;
   end;
  end if;
  return new;$new$);
 updated:=replace(updated, $old$if new.reading_status in ('reading','re_reading') and new.work_status <> 'deleted' then$old$, $new$if new.reading_status in ('reading','re_reading') and new.work_status <> 'deleted'
   and not (tg_op='UPDATE' and new.reading_status='re_reading' and old.reading_status='re_reading' and old.reading_provenance->>'statusOrigin' is distinct from 'derived' and current_setting('app.chapter_edit',true)='true' and current_setting('app.reading_intent',true)='preserve') then$new$);
 updated:=replace(updated, $old$m->>'publication_status' = 'abandoned' and new.reading_status not in ('did_not_finish','paused_reading') then$old$, $new$m->>'publication_status' = 'abandoned' and new.reading_status not in ('did_not_finish','paused_reading')
   and not (tg_op='UPDATE' and new.reading_status='re_reading' and old.reading_status='re_reading' and old.reading_provenance->>'statusOrigin' is distinct from 'derived' and current_setting('app.chapter_edit',true)='true' and current_setting('app.reading_intent',true)='preserve') then$new$);
 execute updated;
end $$;

-- Preserve manual status decisions separately from the fact that progress was
-- entered by a person. Old clients are conservatively treated as explicit.
create or replace function public.track_reading_provenance() returns trigger
language plpgsql set search_path='' as $$
declare intent text:=nullif(current_setting('app.reading_intent',true),''); changed boolean;
begin
 if tg_op='INSERT' then
  if new.reading_provenance<>'{}'::jsonb or new.reading_history<>'[]'::jsonb then return new; end if;
  changed:=true;
 else changed:=(new.reading_status,new.last_read_chapter,new.started_at,new.finished_at) is distinct from (old.reading_status,old.last_read_chapter,old.started_at,old.finished_at) or intent='explicit' and old.reading_provenance->>'statusOrigin' is distinct from 'explicit'; end if;
 if changed then
  if intent='preserve' then intent:=case when tg_op='UPDATE' then coalesce(old.reading_provenance->>'statusOrigin','explicit') else 'explicit' end; end if;
  if new.reading_status::text is distinct from nullif(current_setting('app.requested_reading_status',true),'') then intent:='derived'; end if;
  if tg_op='UPDATE' and intent='derived' and new.reading_status=old.reading_status and old.reading_provenance->>'statusOrigin' is distinct from 'derived' then intent:='explicit'; end if;
  new.reading_provenance:=jsonb_build_object('source','manual','progressKnown',true,'statusOrigin',coalesce(intent,'explicit'));
 end if;
 return new;
end $$;

create function public.track_manual_metadata() returns trigger
language plpgsql set search_path='' as $$
declare k text; times jsonb:='{}';
begin
 if tg_op='INSERT' and new.metadata_confirmation_times<>'{}'::jsonb and new.reading_history<>'[]'::jsonb then return new; end if;
 if tg_op='UPDATE' then times:=old.metadata_confirmation_times; end if;
 foreach k in array array['published_chapters','publication_status'] loop
  if new.metadata_overrides ? k and (tg_op='INSERT' or new.metadata_overrides->k is distinct from old.metadata_overrides->k or k='published_chapters' and new.metadata_overrides->'chapter_count_manual' is distinct from old.metadata_overrides->'chapter_count_manual') then times:=jsonb_set(times,array[k],to_jsonb(statement_timestamp())); end if;
 end loop;
 new.metadata_confirmation_times:=times;
 return new;
end $$;
revoke all on function public.track_manual_metadata() from public,anon,authenticated;
create trigger track_manual_metadata before insert or update on public.library_entries for each row execute function public.track_manual_metadata();

-- Extend existing checked mutations and snapshots, retaining their merge and
-- owner locks. Count reviews also guard automatic metadata and history changes.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_edit_snapshot(uuid)'::regprocedure) into definition;
 updated:=replace(definition,'''status'',e.reading_status,', '''chapterState'',jsonb_build_object(''published_chapters'',public.entry_chapter_metadata(e)->''published_chapters'',''total_chapters'',public.entry_chapter_metadata(e)->''total_chapters'',''publication_status'',public.entry_chapter_metadata(e)->''publication_status''),''status'',e.reading_status,');
 if updated=definition then raise exception 'Review chapter snapshot'; end if;
 execute updated;
 select pg_get_functiondef('public.save_library_story_checked(uuid,text,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,' saved_id:=public.save_library_story(', $new$
 if p_input->>'statusOrigin' is not null and p_input->>'statusOrigin' not in ('explicit','derived','preserve') then raise exception 'Invalid status origin' using errcode='22023'; end if;
 if p_id is not null and p_input ? 'chapterChoice' and (p_base->'status',p_base->'progress') is distinct from (saved->'status',saved->'progress') then raise exception 'Reading progress changed. Review the chapter choice again.' using errcode='40001'; end if;
 if p_id is not null and (edits->'metadata'->'published_chapters') is distinct from (saved->'metadata'->'published_chapters') then
  if p_base->'chapterState' is distinct from saved->'chapterState' then raise exception 'Chapter metadata changed. Reload and review the count again.' using errcode='40001'; end if;
 end if;
 if p_input ? 'allowSeparate' and jsonb_typeof(p_input->'allowSeparate') is distinct from 'boolean' then raise exception 'Invalid duplicate choice' using errcode='22023'; end if;
 perform set_config('app.allow_separate_story',coalesce(p_input->>'allowSeparate','false'),true);
 perform set_config('app.submitted_story_url',coalesce(p_input->>'submittedUrl',''),true);
 perform set_config('app.chapter_edit','true',true);
 perform set_config('app.chapter_choice',coalesce(p_input->>'chapterChoice',''),true);
 perform set_config('app.reading_intent',coalesce(p_input->>'statusOrigin','preserve'),true);
 saved_id:=public.save_library_story($new$);
 updated:=replace(updated,' return saved_id;', $new$ perform set_config('app.allow_separate_story','',true); perform set_config('app.submitted_story_url','',true); perform set_config('app.chapter_edit','',true); perform set_config('app.chapter_choice','',true); perform set_config('app.reading_intent','',true);
 return saved_id;$new$);
 if updated=definition then raise exception 'Review checked chapter save'; end if;
 execute updated;
 select pg_get_functiondef('public.update_library_entry_checked(uuid,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $patch$k not in ('status','progress','notes','rating','favorite','rec')$patch$, $patch$k not in ('status','progress','notes','rating','favorite','rec','statusOrigin')$patch$);
 -- Validate the control separately; it is never itself a writable entry column.
 updated:=replace(updated, ' saved:=public.library_edit_snapshot(p_id);', $new$
 if p_input->>'statusOrigin' is not null and p_input->>'statusOrigin' not in ('explicit','derived','preserve') then raise exception 'Invalid status origin' using errcode='22023'; end if;
 perform set_config('app.reading_intent',case when p_input ? 'status' or p_input ? 'progress' then coalesce(p_input->>'statusOrigin','explicit') else 'preserve' end,true);
 saved:=public.library_edit_snapshot(p_id);$new$);
 updated:=replace(updated, 'where id=p_id;', 'where id=p_id; perform set_config(''app.reading_intent'','''',true);');
 execute updated;
end $$;

-- Source-qualified alias matching and field-aware confidence share the ordinary
-- filtering/query/automatic-collection path.
create function public.story_field_confidence(s jsonb,field text) returns text
language sql immutable set search_path='' as $$
 select case when s->'metadata'->field is null or s->'metadata'->field in ('null'::jsonb,'"unknown"'::jsonb) then 'unknown'
 when s->'metadata_overrides' ? field then 'manual'
 when field='publication_status' and s->>'work_status'='deleted' then 'unknown'
 when s->'extension_metadata' ? field or field='publication_status' and s->'extension_metadata' ? 'is_complete' then 'automatic'
 when s->>'source_url' is null and s->'work'->'field_provenance'->(case field when 'publication_status' then 'is_complete' else field end)->>'source'='ao3' then 'verified'
 else 'unknown' end;
$$;
revoke all on function public.story_field_confidence(jsonb,text) from public,anon;
grant execute on function public.story_field_confidence(jsonb,text) to authenticated,service_role;
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, 'f->''tagAliases''', '(case when s->>''source_url'' is null then f->''tagAliases'' else ''{}''::jsonb end)');
 updated:=replace(updated, ' return (', $new$ return (coalesce(f->>'countConfidence','') in ('','any') or public.story_field_confidence(s,'published_chapters')=f->>'countConfidence')
 and (coalesce(f->>'publicationConfidence','') in ('','any') or public.story_field_confidence(s,'publication_status')=f->>'publicationConfidence')
 and (not coalesce((f->>'needsCompletionVerification')::boolean,false) or s->'metadata'->>'publication_status'='unknown' or s->'metadata'->>'publication_status' in ('abandoned','deleted') and public.story_field_confidence(s,'publication_status')<>'manual') and ($new$);
 if updated=definition then raise exception 'Review source confidence filter'; end if;
 execute updated;
end $$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.index_library_document()'::regprocedure) into definition;
 updated:=replace(definition,E'begin\n', E'begin\n new.story:=new.story||jsonb_build_object(''metadataConfidence'',jsonb_build_object(''published_chapters'',public.story_field_confidence(new.story,''published_chapters''),''publication_status'',public.story_field_confidence(new.story,''publication_status'')));\n');
 execute updated;
 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, $patch$'personalNotes'$patch$, $patch$'personalNotes','needsCompletionVerification'$patch$);
 updated:=replace(updated, $patch$'groupBy')$patch$, $patch$'groupBy','countConfidence','publicationConfidence')$patch$);
 execute updated;
end $$;

-- Intent is optional for older companion clients. Only explicit user controls
-- mark Finished explicit; finishing a chapter can still derive completion.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ perform set_config('app.chapter_read','',true);$old$, $new$
 if p_action in ('save','progress') and p_input ? 'statusOrigin' then
  if p_input->>'statusOrigin' not in ('explicit','derived','preserve') then raise exception 'Invalid status origin' using errcode='22023'; end if;
  perform set_config('app.reading_intent',p_input->>'statusOrigin',true);
 end if;
 perform set_config('app.chapter_read','',true);$new$);
 updated:=replace(updated,$old$ return jsonb_build_object('entry',result,$old$, $new$ perform set_config('app.reading_intent','',true);
 return jsonb_build_object('entry',result,$new$);
 execute updated;
 select pg_get_functiondef('public.mark_work_deleted(uuid,uuid)'::regprocedure) into definition;
 updated:=replace(definition,$old$set work_status='deleted' where id=p_entry$old$, $new$set work_status='deleted',metadata_overrides=metadata_overrides||jsonb_build_object('publication_status','deleted') where id=p_entry$new$);
 execute updated;
end $$;
select public.refresh_library_documents(array(select id from public.library_entries));
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'if t=''library_entries'' then', $new$if t='library_entries' then
   select coalesce(jsonb_agg(r||jsonb_build_object('metadata_confirmation_times',coalesce(nullif(r->'metadata_confirmation_times','null'::jsonb),'{}'::jsonb))),'[]') into rows from jsonb_array_elements(rows) r;$new$);
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
