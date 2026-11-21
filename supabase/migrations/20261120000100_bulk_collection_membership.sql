-- Qualify the input ID so validation checks each requested collection.
create or replace function public.check_manual_story_collections(p_owner uuid,p_collections uuid[]) returns void
language plpgsql set search_path='' as $$
begin
 perform id from public.collections where id=any(p_collections) and user_id=p_owner order by id for share;
 if exists(select 1 from unnest(p_collections) as requested(collection_id) where not exists(
  select 1 from public.collections c where c.id=requested.collection_id and c.user_id=p_owner and c.default_key is null and c.automatic_rules is null
 )) then raise exception 'Choose available manual collections' using errcode='22023'; end if;
end;
$$;

-- Apply bulk membership changes atomically, including shared crosspost organization.
create function public.change_story_collection_memberships(p_entries uuid[],p_collections uuid[],p_add boolean) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); shared record;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if cardinality(p_entries)=0 or cardinality(p_collections)=0 then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 perform id from public.library_entries where user_id=owner_id and id=any(p_entries) order by id for update;
 if exists(select 1 from unnest(p_entries) as requested(entry_id) where not exists(
  select 1 from public.library_entries e where e.id=requested.entry_id and e.user_id=owner_id
 )) then
  raise exception 'Choose available stories' using errcode='22023';
 end if;
 perform public.check_manual_story_collections(owner_id,p_collections);
 for shared in
  select g.group_id,g.settings from public.crosspost_organization g where g.user_id=owner_id
   and exists(select 1 from public.library_entries e
    where e.user_id=owner_id and e.crosspost_group_id=g.group_id and e.id=any(p_entries))
   and case when p_add then not (g.settings->'collections' @> to_jsonb(p_collections))
    else g.settings->'collections' ?| array(select id::text from unnest(p_collections) id) end
  order by g.group_id for update
 loop
  perform public.store_crosspost_organization(owner_id,shared.group_id,case when p_add
   then public.with_crosspost_collections(shared.settings,p_collections)
   else jsonb_set(shared.settings,'{collections}',(shared.settings->'collections') - array(select id::text from unnest(p_collections) id))
  end);
 end loop;
 if p_add then
  insert into public.collection_works(user_id,collection_id,library_entry_id)
  select owner_id,c,e.id from unnest(p_collections) c cross join public.library_entries e
  where e.user_id=owner_id and e.id=any(p_entries) and not exists(
   select 1 from public.crosspost_organization g where g.user_id=owner_id and g.group_id=e.crosspost_group_id
  ) on conflict do nothing;
 else
  delete from public.collection_works m using public.library_entries e
  where m.user_id=owner_id and e.user_id=owner_id and m.library_entry_id=e.id
   and e.id=any(p_entries) and m.collection_id=any(p_collections)
   and not exists(select 1 from public.crosspost_organization g
    where g.user_id=owner_id and g.group_id=e.crosspost_group_id);
 end if;
end;
$$;

revoke all on function public.change_story_collection_memberships(uuid[],uuid[],boolean) from public,anon,authenticated;

create or replace function public.add_stories_to_collections(p_entries uuid[],p_collections uuid[]) returns void
language sql security definer set search_path='' as $$
 select public.change_story_collection_memberships(p_entries,p_collections,true);
$$;

create function public.remove_stories_from_collection(p_entries uuid[],p_collection uuid) returns void
language sql security definer set search_path='' as $$
 select public.change_story_collection_memberships(p_entries,array[p_collection],false);
$$;
revoke all on function public.remove_stories_from_collection(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.remove_stories_from_collection(uuid[],uuid) to authenticated;


-- Reuse the library match cache and the same preferred-version projection as query_library.
create function public.library_collection_work_ids(p_shelf text) returns jsonb
language sql volatile set search_path='' as $$
 with matches as (
  select case when p_shelf='series' then '[]'::jsonb else public.collapse_story_version_ids(
   public.library_query_matches(jsonb_build_object('mode','library','shelf',p_shelf,'filters','{}'::jsonb))->'ids'
  ) end ids
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'organizationGroup',g.group_id) order by selected.ordinality),'[]'::jsonb)
 from matches
 cross join lateral jsonb_array_elements_text(ids) with ordinality as selected(id,ordinality)
 join public.library_entries e on e.id=selected.id::uuid and e.user_id=(select auth.uid())
 left join public.crosspost_organization g on g.group_id=e.crosspost_group_id and g.user_id=e.user_id;
$$;
revoke all on function public.library_collection_work_ids(text) from public,anon,authenticated;
grant execute on function public.library_collection_work_ids(text) to authenticated;
