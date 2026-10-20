-- A failed version-history insert can leave this SQL committed. Allow a retry.
begin;

-- Three-way merge under the entry lock: unchanged local fields follow the saved
-- value; divergent edits require an explicit choice. Lists represent sets.
create or replace function public.merge_library_edits(p_base jsonb, p_local jsonb, p_saved jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare merged jsonb:=coalesce(p_saved,'{}'); conflicts jsonb:='[]'; k text; v jsonb; b jsonb; s jsonb; nested jsonb;
begin
 -- Status and completed chapters describe one reading position; merge them as
 -- a unit so Finished from one device cannot combine with older progress.
 if p_local ? 'status' or p_local ? 'progress' then
  p_local:=(p_local-'status'-'progress') || jsonb_build_object('reading',jsonb_build_object('status',coalesce(p_local->'status',p_base->'status',p_saved->'status'),'progress',coalesce(p_local->'progress',p_base->'progress',p_saved->'progress')));
  p_base:=(p_base-'status'-'progress') || jsonb_build_object('reading',jsonb_build_object('status',p_base->'status','progress',p_base->'progress'));
  p_saved:=(p_saved-'status'-'progress') || jsonb_build_object('reading',jsonb_build_object('status',p_saved->'status','progress',p_saved->'progress'));
  merged:=p_saved;
 end if;
 for k,v in select * from jsonb_each(p_local) loop
  b:=p_base->k; s:=p_saved->k;
  if k='metadata' then
   nested:=public.merge_library_edits(coalesce(b,'{}'),v,coalesce(s,'{}'));
   merged:=jsonb_set(merged,array[k],nested->'merged');
   conflicts:=conflicts || coalesce((select jsonb_agg(c || jsonb_build_object('field','metadata.' || (c->>'field'))) from jsonb_array_elements(nested->'conflicts') c),'[]');
   continue;
  end if;
  if k in ('tags','collections') then
   select coalesce(jsonb_agg(value order by value),'[]') into v from (select distinct value from jsonb_array_elements(v)) a;
   if jsonb_typeof(b)='array' then
    select coalesce(jsonb_agg(value order by value),'[]') into b from (select distinct value from jsonb_array_elements(b)) a;
   end if;
   if jsonb_typeof(s)='array' then
    select coalesce(jsonb_agg(value order by value),'[]') into s from (select distinct value from jsonb_array_elements(s)) a;
   end if;
  end if;
  if v is not distinct from b or v is not distinct from s then continue; end if;
  merged:=jsonb_set(merged,array[k],v);
  if s is distinct from b then
   conflicts:=conflicts || jsonb_build_array(jsonb_build_object('field',k,'base',b,'local',v,'saved',s));
  end if;
 end loop;
 if merged ? 'reading' then merged:=(merged-'reading') || (merged->'reading'); end if;
 return jsonb_build_object('merged',merged,'conflicts',conflicts);
end;
$$;
revoke all on function public.merge_library_edits(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.library_edit_snapshot(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('status',e.reading_status,'progress',e.last_read_chapter,
  'notes',e.notes,'rating',e.personal_rating,'favorite',e.is_favorite,'metadata',e.metadata_overrides,
  'tags',coalesce((select jsonb_agg(t.name order by t.name) from public.library_entry_tags l join public.personal_tags t on t.id=l.personal_tag_id where l.library_entry_id=e.id),'[]'),
  'collections',coalesce((select jsonb_agg(c.collection_id order by c.collection_id) from public.collection_works c where c.library_entry_id=e.id),'[]'))
 from public.library_entries e where e.id=p_id;
$$;
revoke all on function public.library_edit_snapshot(uuid) from public,anon,authenticated;

create or replace function public.save_library_story_checked(p_id uuid, p_url text, p_input jsonb, p_base jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved jsonb; result jsonb; edits jsonb:=p_input;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_id is not null then
  perform 1 from public.library_entries where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Story no longer available' using errcode='42501'; end if;
  if p_base is null or jsonb_typeof(p_base)<>'object' then raise exception 'Reload this editor before saving' using errcode='22023'; end if;
  saved:=public.library_edit_snapshot(p_id);
  result:=public.merge_library_edits(p_base,p_input,saved);
  if result->'conflicts'<>'[]'::jsonb then
   raise exception 'This fic changed on another device. Review the conflicting fields before saving.'
    using errcode='40001', detail=(result || jsonb_build_object('base',saved))::text;
  end if;
  edits:=result->'merged';
 end if;
 return public.save_library_story(p_url,coalesce(edits->'metadata','{}'),(edits->>'status')::public.reading_status,
  (edits->>'progress')::integer,edits->>'notes',(edits->>'rating')::smallint,(edits->>'favorite')::boolean,
  array(select jsonb_array_elements_text(edits->'collections')::uuid),array(select jsonb_array_elements_text(edits->'tags')),p_id);
end;
$$;
revoke all on function public.save_library_story_checked(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_library_story_checked(uuid,text,jsonb,jsonb) to authenticated;

-- Reuse the same merge for small website edits without resubmitting other fields.
create or replace function public.update_library_entry_checked(p_id uuid, p_input jsonb, p_base jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare saved jsonb; result jsonb; edits jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform 1 from public.library_entries where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Story no longer available' using errcode='42501'; end if;
 if p_base is null or jsonb_typeof(p_base)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','progress','notes','rating','favorite')) then
  raise exception 'Invalid entry edit' using errcode='22023';
 end if;
 saved:=public.library_edit_snapshot(p_id);
 result:=public.merge_library_edits(p_base,p_input,saved);
 if result->'conflicts'<>'[]'::jsonb then
  raise exception 'This fic changed on another device. Review the conflicting fields before saving.'
   using errcode='40001', detail=(result || jsonb_build_object('base',saved))::text;
 end if;
 edits:=result->'merged';
 update public.library_entries set reading_status=(edits->>'status')::public.reading_status,
  last_read_chapter=(edits->>'progress')::integer,notes=edits->>'notes',personal_rating=(edits->>'rating')::smallint,
  is_favorite=(edits->>'favorite')::boolean where id=p_id;
end;
$$;
revoke all on function public.update_library_entry_checked(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_library_entry_checked(uuid,jsonb,jsonb) to authenticated;

-- Membership-only actions also participate in the entry lock, so an Add to
-- collection request cannot be lost between a save's snapshot and its writes.
create or replace function public.lock_library_membership_edit() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  perform 1 from public.library_entries where id=old.library_entry_id for update;
  return old;
 end if;
 perform 1 from public.library_entries where id=new.library_entry_id for update;
 return new;
end;
$$;
revoke all on function public.lock_library_membership_edit() from public,anon,authenticated;
create or replace trigger lock_library_membership_edit before insert or delete on public.collection_works
 for each row execute function public.lock_library_membership_edit();
create or replace trigger lock_library_membership_edit before insert or delete on public.library_entry_tags
 for each row execute function public.lock_library_membership_edit();

-- Paired Safari devices share the exact merge and conflict detail format. Old
-- scripts retain their existing version guard until their users update them.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 -- The version guard below remains in the patched function, so do not wrap it twice.
 if position('saved:=public.library_edit_snapshot(entry.id)' in definition)>0 then return; end if;
 updated:=replace(definition,$old$  if (entry.id is not null and (p_input->>'version') is distinct from entry.updated_at::text)$old$,$new$  if entry.id is not null and p_input ? 'base' and p_action in ('save','progress') then
   declare saved jsonb; result jsonb; local_edits jsonb; begin
    saved:=public.library_edit_snapshot(entry.id)-'metadata'-'favorite';
    local_edits:=case when p_action='progress' then jsonb_build_object('status',p_input->'status','progress',p_input->'progress')
     else p_input-'base'-'metadata'-'version' end;
    result:=public.merge_library_edits(p_input->'base',local_edits,saved);
    if result->'conflicts'<>'[]'::jsonb then
     raise exception 'This fic changed on another device. Review the conflicting fields before saving.'
      using errcode='40001', detail=(result || jsonb_build_object('base',saved))::text;
    end if;
    p_input:=p_input || (result->'merged') || jsonb_build_object('version',entry.updated_at::text);
   end;
  end if;
  if (entry.id is not null and (p_input->>'version') is distinct from entry.updated_at::text)$new$);
 if updated=definition then raise exception 'Review paired-device merge boundary'; end if;
 execute updated;
end;
$$;
commit;
