begin;

create table public.crosspost_organization (
 user_id uuid not null references auth.users(id) on delete cascade,
 group_id uuid not null,
 settings jsonb not null,
 primary key(user_id,group_id)
);
alter table public.crosspost_organization enable row level security;
alter table public.crosspost_organization force row level security;
revoke all on public.crosspost_organization from public,anon,authenticated;
create policy own_crosspost_organization on public.crosspost_organization for select to authenticated using(user_id=(select auth.uid()));
grant select on public.crosspost_organization to authenticated;

create function public.story_organization(s jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('notes',s->'notes','rating',s->'personal_rating','favorite',s->'is_favorite',
  'collections',s->'collectionIds','tags',s->'personalTags');
$$;
revoke all on function public.story_organization(jsonb) from public,anon;
grant execute on function public.story_organization(jsonb) to authenticated,service_role;

create function public.check_manual_story_collections(p_owner uuid,p_collections uuid[]) returns void
language plpgsql set search_path='' as $$
begin
 -- Share collection locks with other membership edits and serialize against
 -- collection deletion or conversion while the document is being refreshed.
 perform id from public.collections where id=any(p_collections) and user_id=p_owner order by id for share;
 if exists(select 1 from unnest(p_collections) id where not exists(
  select 1 from public.collections c where c.id=id and c.user_id=p_owner and c.default_key is null and c.automatic_rules is null
 )) then raise exception 'Choose available manual collections' using errcode='22023'; end if;
end;
$$;

create function public.normalize_crosspost_organization(p_owner uuid,p_settings jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare collections uuid[];
begin
 if jsonb_typeof(p_settings) is distinct from 'object'
  or jsonb_typeof(p_settings->'notes') is distinct from 'string'
  or jsonb_typeof(p_settings->'favorite') is distinct from 'boolean'
  or not (p_settings ? 'rating') or not (p_settings->'rating' in ('null','1','2','3','4','5'))
  or jsonb_typeof(p_settings->'collections') is distinct from 'array'
  or jsonb_typeof(p_settings->'tags') is distinct from 'array' then
  raise exception 'Review all shared organization fields before saving' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_settings->'tags') t where jsonb_typeof(t)<>'string')
  or exists(select 1 from jsonb_array_elements(p_settings->'collections') c where jsonb_typeof(c)<>'string') then
  raise exception 'Invalid shared tags or collections' using errcode='22023';
 end if;
 collections:=array(select distinct value::uuid from jsonb_array_elements_text(p_settings->'collections') order by value::uuid);
 perform public.check_manual_story_collections(p_owner,collections);
 return jsonb_build_object('notes',p_settings->'notes','rating',p_settings->'rating','favorite',p_settings->'favorite',
  'collections',to_jsonb(collections),'tags',array(
   select distinct btrim(value) from jsonb_array_elements_text(p_settings->'tags') where btrim(value)<>'' order by btrim(value)));
end;
$$;

create function public.store_crosspost_organization(p_owner uuid,p_group uuid,p_settings jsonb) returns void
language plpgsql set search_path='' as $$
declare reviewed jsonb; previous jsonb;
begin
 select settings into previous from public.crosspost_organization where user_id=p_owner and group_id=p_group;
 reviewed:=public.normalize_crosspost_organization(p_owner,p_settings);
 if reviewed is not distinct from previous then return; end if;
 insert into public.crosspost_organization(user_id,group_id,settings) values(p_owner,p_group,reviewed)
 on conflict(user_id,group_id) do update set settings=excluded.settings;
 update public.collections c set last_story_added_at=greatest(c.last_story_added_at,now())
 where c.user_id=p_owner and reviewed->'collections' ? c.id::text
  and not coalesce(previous->'collections' ? c.id::text,false);
end;
$$;

create function public.with_crosspost_collections(p_settings jsonb,p_ids uuid[]) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_set(p_settings,'{collections}',to_jsonb(array(select distinct id from unnest(
  array(select value::uuid from jsonb_array_elements_text(p_settings->'collections'))||p_ids) id order by id)));
$$;

create function public.refresh_crosspost_organization() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.refresh_library_documents(array(
  select id from public.library_entries where user_id=coalesce(new.user_id,old.user_id)
   and crosspost_group_id=coalesce(new.group_id,old.group_id) order by id));
 return null;
end;
$$;
create trigger refresh_crosspost_organization after insert or update or delete on public.crosspost_organization
 for each row execute function public.refresh_crosspost_organization();

-- Keep the original source projection available for Compare Versions and Undo.
do $$ declare definition text; updated text; begin
 select pg_get_viewdef('public.library_story_documents'::regclass,true) into definition;
 execute 'create or replace view public.library_story_documents with (security_invoker=true) as '||$view$
 select d.id,d.user_id,d.work_id,
  case when g.group_id is null then d.story else d.story||jsonb_build_object(
   'sourceOrganization', public.story_organization(d.story),
   'organizationGroup',g.group_id,'notes',g.settings->'notes','personal_rating',g.settings->'rating',
   'is_favorite',g.settings->'favorite','collectionIds',g.settings->'collections','personalTags',g.settings->'tags') end story
 from ($view$||rtrim(definition,E';\n ')||$view$) d
 left join public.crosspost_organization g on g.user_id=d.user_id and g.group_id=(d.story->>'crosspost_group_id')::uuid
 $view$;

 select pg_get_functiondef('public.library_catalog_story(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$jsonb_build_object('crosspost_group_id',s->'crosspost_group_id')$old$,
  $new$jsonb_build_object('crosspost_group_id',s->'crosspost_group_id','organizationGroup',s->'organizationGroup')$new$);
 if updated=definition then raise exception 'Review shared organization catalog'; end if;
 execute updated;

 select pg_get_functiondef('public.story_versions(uuid,text,text[])'::regprocedure) into definition;
 updated:=replace(definition,$old$story->>'updated_at')$old$,
  $new$story->>'updated_at',public.story_organization(story),story->'sourceOrganization')$new$);
 if updated=definition then raise exception 'Review organization comparison revision'; end if;
 execute updated;

 select pg_get_functiondef('public.clear_unlinked_crosspost_state()'::regprocedure) into definition;
 updated:=replace(definition,' return null;', $new$
 delete from public.crosspost_organization g where g.user_id=old.user_id and g.group_id=old.crosspost_group_id
  and not exists(select 1 from public.library_entries e where e.user_id=g.user_id and e.crosspost_group_id=g.group_id);
 return null;$new$);
 if updated=definition then raise exception 'Review group dissolution'; end if;
 execute updated;
end $$;

-- A collection ceases to be selectable when deleted or converted to automatic.
create function public.remove_shared_collection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.crosspost_organization
 set settings=jsonb_set(settings,'{collections}',(settings->'collections')-old.id::text)
 where user_id=old.user_id and settings->'collections' ? old.id::text;
 return null;
end;
$$;
create trigger remove_deleted_shared_collection after delete on public.collections
 for each row execute function public.remove_shared_collection();
create trigger remove_automatic_shared_collection after update of automatic_rules on public.collections
 for each row when (old.automatic_rules is null and new.automatic_rules is not null)
 execute function public.remove_shared_collection();

alter function public.write_story_versions(uuid,uuid,text,text,timestamptz) rename to write_story_versions_internal;
revoke all on function public.write_story_versions_internal(uuid,uuid,text,text,timestamptz) from authenticated;

create function public.write_story_versions(p_entry uuid,p_target uuid,p_action text,p_revision text,
 p_target_updated_at timestamptz default null,p_organization jsonb default null,p_target_organization jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); linked_group uuid;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if p_action in ('link','reconcile') then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
  select crosspost_group_id into linked_group from public.library_entries where id=p_entry and user_id=owner_id;
  if not found then raise insufficient_privilege; end if;
  perform id from public.library_entries where user_id=owner_id and (id in (p_entry,p_target) or crosspost_group_id=linked_group) order by id for update;
  if p_organization is null then raise exception 'Review all shared organization fields before saving' using errcode='22023'; end if;
  if p_action='link' then
   if not exists(select 1 from public.library_entries where id=p_target and user_id=owner_id) then raise insufficient_privilege; end if;
   if p_target_organization is null or p_target_organization is distinct from (
    select public.story_organization(d.story) from public.library_search_documents d where d.id=p_target and d.user_id=owner_id
   ) then raise exception 'The selected version changed. Review it before linking.' using errcode='40001'; end if;
   perform public.write_story_versions_internal(p_entry,p_target,p_action,p_revision,p_target_updated_at);
   select crosspost_group_id into linked_group from public.library_entries where id=p_entry;
  else
   if linked_group is null or (select count(*) from public.library_entries
    where user_id=owner_id and crosspost_group_id=linked_group)<2 then
    raise exception 'Choose linked versions to reconcile' using errcode='22023';
   end if;
   if p_revision is null or p_revision is distinct from public.story_versions(p_entry)->>'revision' then
    raise exception 'Versions changed. Review the current sources before saving.' using errcode='40001';
   end if;
  end if;
  perform public.store_crosspost_organization(owner_id,linked_group,p_organization);
  return p_entry;
 end if;
 return public.write_story_versions_internal(p_entry,p_target,p_action,p_revision,p_target_updated_at);
end;
$$;

-- A modern organizer snapshot identifies the organization it was editing.
-- Legacy callers continue to edit the independent source fields.
create function public.checked_story_organization(p_entry uuid,p_base jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare shared record;
begin
 if not (p_base ? 'organizationGroup') then return null; end if;
 select g.group_id,g.settings into shared from public.library_entries e
 join public.crosspost_organization g on g.user_id=e.user_id and g.group_id=e.crosspost_group_id
 where e.id=p_entry and e.user_id=auth.uid() for update of g;
 if to_jsonb(shared.group_id) is distinct from nullif(p_base->'organizationGroup','null') then
  raise exception 'Shared organization changed. Reload this story before editing it.' using errcode='40001';
 end if;
 if shared.group_id is null then return null; end if;
 return shared.settings||jsonb_build_object('organizationGroup',shared.group_id);
end;
$$;

do $$ declare signature text; definition text; updated text; begin
 foreach signature in array array['public.save_library_story_checked(uuid,text,jsonb,jsonb)','public.update_library_entry_checked(uuid,jsonb,jsonb)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,'saved jsonb; result jsonb;', 'source_saved jsonb; shared jsonb; saved jsonb; result jsonb;');
  updated:=replace(updated,'saved:=public.library_edit_snapshot(p_id);', $new$
   source_saved:=public.library_edit_snapshot(p_id);
   shared:=public.checked_story_organization(p_id,p_base);
   saved:=source_saved||coalesce(shared,'{}'::jsonb);
   if p_base ? 'organizationGroup' and shared is null then saved:=saved||jsonb_build_object('organizationGroup',null); end if;$new$);
  updated:=replace(updated,$old$edits:=result->'merged';$old$,$new$edits:=result->'merged';
   if shared is not null then
    perform public.store_crosspost_organization(auth.uid(),(shared->>'organizationGroup')::uuid,edits);
    edits:=(edits-array['notes','rating','favorite','collections','tags'])||
     jsonb_build_object('notes',source_saved->'notes','rating',source_saved->'rating','favorite',source_saved->'favorite',
      'collections',source_saved->'collections','tags',source_saved->'tags');
   end if;$new$);
  -- Take the same owner lock as linking before locking a source.
  updated:=replace(updated,'perform 1 from public.library_entries where id=p_id', $new$
  if p_base ? 'organizationGroup' then
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':story-versions',0));
  end if;
  perform 1 from public.library_entries where id=p_id$new$);
  if updated not like '%perform public.store_crosspost_organization%' or updated not like '%pg_advisory_xact_lock%' then
   raise exception 'Review shared checked edit boundary: %',signature;
  end if;
  if signature like '%save_library_story_checked%' then
   updated:=replace(updated,' saved_id:=public.save_library_story(', $new$
    perform set_config('app.keep_source_story_memberships', (shared is not null)::text, true);
    saved_id:=public.save_library_story($new$);
   updated:=replace(updated,' return saved_id;', $new$
    perform set_config('app.keep_source_story_memberships','',true);
    return saved_id;$new$);
   if updated not like '%set_config(''app.keep_source_story_memberships''%' then raise exception 'Review source membership preservation'; end if;
  end if;
  execute updated;
 end loop;

 select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
 updated:=replace(definition,'  if exists(select 1 from unnest(p_collections)', $new$
  if p_id is not null and current_setting('app.keep_source_story_memberships',true)='true' then return entry_uuid; end if;
  if exists(select 1 from unnest(p_collections)$new$);
 if updated=definition then raise exception 'Review legacy source membership writer'; end if;
 execute updated;
end $$;

create function public.add_stories_to_collections(p_entries uuid[],p_collections uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); shared record;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if cardinality(p_entries)=0 or cardinality(p_collections)=0 then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 perform id from public.library_entries where user_id=owner_id and id=any(p_entries) order by id for update;
 if exists(select 1 from unnest(p_entries) id where not exists(select 1 from public.library_entries e where e.id=id and e.user_id=owner_id)) then
  raise exception 'Choose available stories' using errcode='22023';
 end if;
 perform public.check_manual_story_collections(owner_id,p_collections);
 for shared in
  select g.group_id,g.settings from public.crosspost_organization g where g.user_id=owner_id
   and exists(select 1 from public.library_entries e
    where e.user_id=owner_id and e.crosspost_group_id=g.group_id and e.id=any(p_entries))
   and not g.settings->'collections' @> to_jsonb(p_collections)
  order by g.group_id for update
 loop
  perform public.store_crosspost_organization(owner_id,shared.group_id,public.with_crosspost_collections(shared.settings,p_collections));
 end loop;
 insert into public.collection_works(user_id,collection_id,library_entry_id)
 select owner_id,c,e.id from unnest(p_collections) c cross join public.library_entries e
 where e.user_id=owner_id and e.id=any(p_entries) and not exists(
  select 1 from public.crosspost_organization g where g.user_id=owner_id and g.group_id=e.crosspost_group_id
 ) on conflict do nothing;
end;
$$;

-- The indexed manual collection branch must use effective memberships too.
-- Keep the existing automatic branch and source-membership index.
create view public.effective_collection_works with (security_invoker=true) as
 select m.user_id,m.collection_id,m.library_entry_id
 from public.collection_works m join public.library_entries e on e.id=m.library_entry_id and e.user_id=m.user_id
 where not exists(select 1 from public.crosspost_organization g where g.user_id=e.user_id and g.group_id=e.crosspost_group_id)
 union all
 select e.user_id,c.value::uuid,e.id
 from public.crosspost_organization g join public.library_entries e on e.user_id=g.user_id and e.crosspost_group_id=g.group_id
 cross join lateral jsonb_array_elements_text(g.settings->'collections') c;
grant select on public.effective_collection_works to authenticated;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_candidate_predicate(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'from public.collection_works','from public.effective_collection_works');
 if updated=definition then raise exception 'Review shared collection scope'; end if;
 execute updated;

 select pg_get_functiondef('public.clear_automatic_manual_memberships()'::regprocedure) into definition;
 updated:=replace(definition,$old$ elsif old.automatic_rules is not null then$old$,$new$
 elsif old.automatic_rules is not null then
  perform public.store_crosspost_organization(g.user_id,g.group_id,public.with_crosspost_collections(g.settings,array[new.id]))
  from public.crosspost_organization g where g.user_id=new.user_id and exists(
   select 1 from public.library_search_documents d
   where d.user_id=g.user_id and d.story->>'organizationGroup'=g.group_id::text
    and public.automatic_collection_matches(d.story,old.automatic_rules));$new$);
 updated:=replace(updated,$old$   and public.automatic_collection_matches(d.story,old.automatic_rules)
  on conflict$old$,$new$   and (d.story->>'organizationGroup') is null
   and public.automatic_collection_matches(d.story,old.automatic_rules)
  on conflict$new$);
 if updated=definition then raise exception 'Review shared organization when collections change type'; end if;
 execute updated;

 select pg_get_functiondef('public.dnf_cleanup_candidates(uuid,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'(e.is_favorite or e.is_rec)', $new$(e.is_favorite or d.is_favorite or e.is_rec)$new$);
 updated:=replace(updated,$old$trim(e.notes)<>'' or e.personal_rating is not null$old$,
  $new$trim(e.notes)<>'' or e.personal_rating is not null or trim(d.story->>'notes')<>''
   or d.story->>'personal_rating' is not null or jsonb_array_length(d.story->'personalTags')>0$new$);
 updated:=replace(updated,$old$and exists(select 1 from public.collection_works cw$old$,
  $new$and ((d.story ? 'organizationGroup' and jsonb_array_length(d.story->'collectionIds')>0) or exists(select 1 from public.collection_works cw$new$);
 updated:=replace(updated,$old$and c.default_key is null and c.automatic_rules is null))$old$,
  $new$and c.default_key is null and c.automatic_rules is null)))$new$);
 if updated=definition then raise exception 'Review DNF shared organization protections'; end if;
 execute updated;
end $$;

-- Linked backups already use version 3. The optional group rows preserve the
-- source fields and remap collection IDs through the existing restore map.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.export_library_backup()'::regprocedure) into definition;
 updated:=replace(definition,$old$ return jsonb_build_object('format','between-chapters-backup',$old$,$new$
 if exists(select 1 from public.crosspost_organization g where g.user_id=owner_id) then
  tables:=tables||jsonb_build_object('crosspost_organization',(select jsonb_agg(to_jsonb(g) order by g.group_id)
   from public.crosspost_organization g where g.user_id=owner_id));
 end if;
 return jsonb_build_object('format','between-chapters-backup',$new$);
 if updated=definition then raise exception 'Review shared organization backup export'; end if;
 execute updated;

 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,$old$ return id_map;$old$,$new$
 if data ? 'crosspost_organization' then
  if p_backup->>'version' is distinct from '3' or jsonb_typeof(data->'crosspost_organization') is distinct from 'array' then
   raise exception 'Invalid shared organization backup';
  end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.crosspost_organization,data->'crosspost_organization') g
   where g.user_id is distinct from source_id or jsonb_typeof(g.settings->'collections') is distinct from 'array'
   or (select count(*) from public.library_entries e
    where e.user_id=p_user and e.crosspost_group_id=g.group_id)<2) then
   raise exception 'Invalid shared organization ownership or link';
  end if;
 end if;
 delete from public.crosspost_organization where user_id=p_user;
 if data ? 'crosspost_organization' then
  insert into public.crosspost_organization(user_id,group_id,settings)
  select p_user,g.group_id,public.normalize_crosspost_organization(p_user,jsonb_set(g.settings,'{collections}',
   coalesce((select jsonb_agg(coalesce(id_map->(value#>>'{}'),value)) from jsonb_array_elements(g.settings->'collections')),'[]')))
  from jsonb_populate_recordset(null::public.crosspost_organization,data->'crosspost_organization') g;
 end if;
 return id_map;$new$);
 if updated=definition then raise exception 'Review shared organization backup restore'; end if;
 execute updated;
end $$;

revoke all on function public.check_manual_story_collections(uuid,uuid[]),public.normalize_crosspost_organization(uuid,jsonb),public.refresh_crosspost_organization(),
 public.remove_shared_collection(),public.checked_story_organization(uuid,jsonb),
 public.store_crosspost_organization(uuid,uuid,jsonb),public.with_crosspost_collections(jsonb,uuid[]),
 public.write_story_versions(uuid,uuid,text,text,timestamptz,jsonb,jsonb),public.add_stories_to_collections(uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.write_story_versions(uuid,uuid,text,text,timestamptz,jsonb,jsonb),
 public.add_stories_to_collections(uuid[],uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
