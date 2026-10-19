begin;

-- Extend the paired-device boundary so refreshes keep its ownership, locking,
-- expiry and stale-write checks, and its existing entry response.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, '(''get'',''save'',''progress'')', '(''get'',''save'',''progress'',''refresh_metadata'')');
 updated := replace(updated, '(''save'',''progress'')', '(''save'',''progress'',''refresh_metadata'')');
 updated := replace(updated, $old$  if p_action='progress' then$old$, $new$  if p_action='refresh_metadata' then
   if entry.id is null then raise exception 'Save this work first'; end if;
   metadata := jsonb_strip_nulls(p_input->'metadata');
   if metadata is null or jsonb_typeof(metadata)<>'object' or octet_length(metadata::text)>400000
    or jsonb_typeof(metadata->'title') is distinct from 'string' or length(trim(metadata->>'title'))=0
    or jsonb_typeof(p_input->'chapters') is distinct from 'object' then
    raise exception 'Invalid work metadata' using errcode='22023';
   end if;
   -- Only automatic work fields enter the private layer. Missing fields preserve
   -- earlier observations; personal fields and manual overrides are never merged.
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into metadata from jsonb_each(metadata)
    where key = any(array['title','summary','authors','author_links','fandoms','ao3_tags',
     'relationship_tags','character_tags','additional_tags','archive_warnings','categories',
     'rating','word_count','published_chapters','total_chapters','is_complete',
     'ao3_published_at','ao3_updated_at','series','series_memberships']);
   if exists(select 1 from jsonb_each(metadata) where key=any(array['title','summary','rating','ao3_published_at','ao3_updated_at']) and jsonb_typeof(value)<>'string')
    or exists(select 1 from jsonb_each(metadata) where key=any(array['word_count','published_chapters','total_chapters'])
     and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or length(value::text)>10)) then
    raise exception 'Invalid work metadata' using errcode='22023';
   end if;
   if exists(select 1 from jsonb_each(metadata) where key=any(array['word_count','published_chapters','total_chapters']) and value::text::numeric>2147483647)
    or (metadata->>'total_chapters')::integer=0
    or (metadata->>'published_chapters')::integer>(metadata->>'total_chapters')::integer then
    raise exception 'Invalid chapter or word count' using errcode='22023';
   end if;
   declare field text; begin
    foreach field in array array['authors','fandoms','ao3_tags','relationship_tags','character_tags','additional_tags','archive_warnings','categories','series'] loop
     if metadata ? field then
      if jsonb_typeof(metadata->field)<>'array' then raise exception 'Expected metadata list' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(metadata->field) v where jsonb_typeof(v)<>'string') then raise exception 'Expected text metadata' using errcode='22023'; end if;
     end if;
    end loop;
   end;
   if metadata ? 'is_complete' then
    if jsonb_typeof(metadata->'is_complete')<>'boolean' then raise exception 'Invalid completion status' using errcode='22023'; end if;
    metadata := metadata || jsonb_build_object('publication_status',case when (metadata->>'is_complete')::boolean then 'complete' else 'in_progress' end);
   end if;
   if exists(select 1 from jsonb_each_text(p_input->'chapters') where key !~ '^[1-9][0-9]*$' or value !~ '^[1-9][0-9]*$' or length(key)>10)
    or exists(select 1 from jsonb_each_text(p_input->'chapters') where key::numeric>coalesce((metadata->>'published_chapters')::integer,0))
    or (select count(*)<>count(distinct value) from jsonb_each_text(p_input->'chapters')) then
    raise exception 'Invalid chapter mapping' using errcode='22023';
   end if;
   update public.library_entries set
    extension_metadata=extension_metadata || metadata || jsonb_build_object('last_metadata_success',now(),'last_metadata_check',now()),
    extension_chapters=case when p_input->'chapters'<>'{}'::jsonb then p_input->'chapters' else extension_chapters end
    where id=entry.id and user_id=device.user_id;
   -- A formerly fixed total becomes unknown if new chapters exceed it.
   update public.library_entries e set extension_metadata=jsonb_set(e.extension_metadata,'{total_chapters}','null'::jsonb)
    from public.works w where e.id=entry.id and w.id=e.work_id
     and coalesce((e.extension_metadata->>'published_chapters')::integer,w.published_chapters)>
      case when e.extension_metadata ? 'total_chapters' then (e.extension_metadata->>'total_chapters')::integer else w.total_chapters end;
   entry_id := entry.id;
  elsif p_action='progress' then$new$);
 if updated=definition or position('elsif p_action=''progress'' then' in updated)=0
  or position('(''get'',''save'',''progress'',''refresh_metadata'')' in updated)=0 then
  raise exception 'Review userscript metadata refresh boundary';
 end if;
 execute updated;
end;
$$;

commit;
