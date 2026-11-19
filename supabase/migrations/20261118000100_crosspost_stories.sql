begin;

-- Existing entries remain the source versions, including their reading history.
-- Group identity is private to the owner and independent of remapped entry IDs.
alter table public.library_entries
 add column crosspost_group_id uuid,
 add column crosspost_order integer,
 add constraint crosspost_membership_complete check (
  (crosspost_group_id is null)=(crosspost_order is null)
 ),
 add constraint crosspost_display_order unique(user_id,crosspost_group_id,crosspost_order);

-- Use the same effective source documents as story details and library search.
create function public.story_versions(p_entry uuid,p_search text default null,p_linked_urls text[] default null) returns jsonb
language sql stable set search_path='' as $$
 with anchor as (
  select e.id,e.user_id,e.crosspost_group_id,d.story
  from public.library_entries e join public.library_search_documents d on d.id=e.id
  where e.id=p_entry and e.user_id=(select auth.uid())
 ), members as (
  select d.story,e.crosspost_order,e.id
  from anchor a join public.library_entries e on e.user_id=a.user_id
   and (e.id=a.id or e.crosspost_group_id=a.crosspost_group_id)
  join public.library_search_documents d on d.id=e.id
 ), candidates as (
  select d.story, (d.story->'metadata'->'authors') ?| array(
   select jsonb_array_elements_text(a.story->'metadata'->'authors')
  ) as shares_author, coalesce(e.source_url,'https://archiveofourown.org/works/'||(d.story->'work'->>'ao3_work_id'))
   =any(p_linked_urls[1:10]) as captured_link
  from anchor a join public.library_entries e on e.user_id=a.user_id
   and e.id<>a.id and e.crosspost_group_id is null
  join public.library_search_documents d on d.id=e.id
  where case when nullif(btrim(p_search),'') is not null then
   position(lower(left(btrim(p_search),200)) in lower(concat_ws(' ',d.story->'metadata'->>'title',e.source_url,e.original_url)))>0
  else coalesce(e.source_url,'https://archiveofourown.org/works/'||(d.story->'work'->>'ao3_work_id'))=any(p_linked_urls[1:10])
   or public.library_normalize(d.story->'metadata'->>'title')=public.library_normalize(a.story->'metadata'->>'title')
   and coalesce(d.story->'metadata'->>'title','')<>''
   and (d.story->'metadata'->'authors') ?| array(select jsonb_array_elements_text(a.story->'metadata'->'authors'))
  end
  order by captured_link desc nulls last,shares_author desc,d.sort_title,e.id limit 15
 )
 select jsonb_build_object(
  'versions',coalesce((select jsonb_agg(story order by crosspost_order,id) from members),'[]'),
  'revision',(select md5(jsonb_agg(jsonb_build_array(id,crosspost_order,story->>'updated_at') order by id)::text) from members),
  'candidates',coalesce((select jsonb_agg(story) from candidates),'[]')
 ) from anchor;
$$;

create function public.write_story_versions(p_entry uuid,p_target uuid,p_action text,p_revision text,p_target_updated_at timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid();
 old_group uuid;
 new_group uuid;
 target_group uuid;
 target_updated_at timestamptz;
 entry_count integer;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if p_action is null or p_action not in ('link','unlink','prefer') or p_target is null then
  raise exception 'Choose a valid version action' using errcode='22023';
 end if;
 -- Serialize edits to this owner's groups and recheck the reviewed version set.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 select crosspost_group_id into old_group from public.library_entries where id=p_entry and user_id=owner_id;
 if not found then raise insufficient_privilege; end if;
 perform id from public.library_entries where user_id=owner_id and (id in (p_entry,p_target) or crosspost_group_id=old_group) order by id for update;
 select crosspost_group_id,updated_at into target_group,target_updated_at
 from public.library_entries where id=p_target and user_id=owner_id;
 if not found then raise insufficient_privilege; end if;
 if p_revision is distinct from (public.story_versions(p_entry)->>'revision') or p_revision is null then
  raise exception 'Versions changed. Review the current sources before saving.' using errcode='40001';
 end if;
 if p_action='link' then
  if p_entry=p_target or target_group is not null then
   raise exception 'Choose a separate saved version. Unlink it from its other story first.' using errcode='22023';
  end if;
  if target_updated_at is distinct from p_target_updated_at then
   raise exception 'The selected version changed. Review it before linking.' using errcode='40001';
  end if;
  new_group:=coalesce(old_group,gen_random_uuid());
  if old_group is null then
   update public.library_entries set crosspost_group_id=new_group,crosspost_order=0 where id=p_entry;
  end if;
  select count(*) into entry_count from public.library_entries where user_id=owner_id and crosspost_group_id=new_group;
  if entry_count>=25 then raise exception 'A story can link up to 25 versions' using errcode='22023'; end if;
  update public.library_entries set crosspost_group_id=new_group,crosspost_order=(
   select max(crosspost_order)+1 from public.library_entries where user_id=owner_id and crosspost_group_id=new_group
  ) where id=p_target;
 else
  if old_group is null or target_group is distinct from old_group then
   raise exception 'This source is not part of the reviewed story' using errcode='22023';
  end if;
  if p_action='prefer' then
   update public.library_entries set crosspost_order=(
    select min(crosspost_order)-1 from public.library_entries where user_id=owner_id and crosspost_group_id=old_group
   ) where id=p_target and crosspost_order>(
    select min(crosspost_order) from public.library_entries where user_id=owner_id and crosspost_group_id=old_group
   );
  else
   update public.library_entries set crosspost_group_id=null,crosspost_order=null where id=p_target;
   update public.library_entries e set crosspost_group_id=null,crosspost_order=null
   where e.user_id=owner_id and e.crosspost_group_id=old_group and not exists (
    select 1 from public.library_entries other
    where other.user_id=e.user_id and other.crosspost_group_id=e.crosspost_group_id and other.id<>e.id
   );
  end if;
 end if;
 return p_entry;
end;
$$;

-- Ordinary removal still removes only the selected source. A remaining singleton
-- becomes independent, which also lets it be linked anew without a stale group.
create function public.clear_single_crosspost_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.library_entries e set crosspost_group_id=null,crosspost_order=null
 where e.user_id=old.user_id and e.crosspost_group_id=old.crosspost_group_id and not exists (
  select 1 from public.library_entries other
  where other.user_id=e.user_id and other.crosspost_group_id=e.crosspost_group_id and other.id<>e.id
 );
 return null;
end;
$$;
create trigger clear_single_crosspost_version after delete on public.library_entries
 for each row when (old.crosspost_group_id is not null) execute function public.clear_single_crosspost_version();

revoke all on function public.story_versions(uuid,text,text[]),public.write_story_versions(uuid,uuid,text,text,timestamptz),
 public.clear_single_crosspost_version() from public,anon,authenticated;
grant execute on function public.story_versions(uuid,text,text[]),public.write_story_versions(uuid,uuid,text,text,timestamptz) to authenticated;

-- Group after filtering so an alternate title or a source-only collection can
-- still find the story. For an unfiltered group the preferred source supplies
-- the tile. Series identities pass through the same ordered result untouched.
create function public.collapse_story_version_ids(p_ids jsonb) returns jsonb
language sql stable set search_path='' as $$
 with ordered_ids as (
  select value id,ordinality from jsonb_array_elements_text(p_ids) with ordinality
 ), preferred as (
  select distinct on (coalesce(e.crosspost_group_id::text,i.id)) i.id,i.ordinality
  from ordered_ids i left join public.library_entries e
   on e.id=case when not starts_with(i.id,'series:') then i.id::uuid end and e.user_id=(select auth.uid())
  order by coalesce(e.crosspost_group_id::text,i.id),e.crosspost_order nulls last,i.ordinality
 )
 select coalesce(jsonb_agg(id order by ordinality),'[]') from preferred;
$$;
revoke all on function public.collapse_story_version_ids(jsonb) from public,anon;
grant execute on function public.collapse_story_version_ids(jsonb) to authenticated;
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,$old$total:=jsonb_array_length(matches->'ids');$old$,$new$
 if exists(select 1 from public.library_entries where user_id=(select auth.uid()) and crosspost_group_id is not null) then
  matches:=jsonb_set(matches,'{ids}',public.collapse_story_version_ids(matches->'ids'));
 end if;
 total:=jsonb_array_length(matches->'ids');$new$);
 if updated=definition then raise exception 'Review grouped story page identities'; end if;
 execute updated;
 select pg_get_functiondef('public.library_catalog_story(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$'collectionIds',s->'collectionIds');$old$,
  $new$'collectionIds',s->'collectionIds')||case when s->>'crosspost_group_id' is not null
  then jsonb_build_object('crosspost_group_id',s->'crosspost_group_id') else '{}'::jsonb end;$new$);
 if updated=definition then raise exception 'Review grouped compact catalog'; end if;
 execute updated;
 select pg_get_functiondef('public.library_navigation_counts()'::regprocedure) into definition;
 updated:=replace(definition,'null::timestamptz updated_at','null::timestamptz updated_at, coalesce(d.s->>''crosspost_group_id'',d.s->>''id'') identity');
 updated:=replace(updated,$old$nullif(d.s->>'updated_at','')::timestamptz$old$,
  $new$nullif(d.s->>'updated_at','')::timestamptz,coalesce(d.s->>'crosspost_group_id',d.s->>'id')$new$);
 updated:=replace(updated,'select c.key,false,null::timestamptz',
  $new$select c.key,false,null::timestamptz,coalesce(d.s->>'crosspost_group_id',d.s->>'id')$new$);
 updated:=replace(updated,'count(m.key) filter(where not m.is_series','count(distinct m.identity) filter(where not m.is_series');
 if updated not like '%count(distinct m.identity)%' then raise exception 'Review grouped navigation counts'; end if;
 execute updated;
 -- Undo of removal restores the source record. Only the reviewed linking RPC
 -- can reattach it to a group that may have changed since removal.
 select pg_get_functiondef('public.restore_library_story(jsonb,uuid[],text[])'::regprocedure) into definition;
 updated:=replace(definition,$old$null::public.library_entries, p_entry$old$,
  $new$null::public.library_entries, p_entry-array['crosspost_group_id','crosspost_order']$new$);
 if updated=definition then raise exception 'Review crosspost source removal undo'; end if;
 execute updated;
end $$;

-- Source membership is stored alongside the existing backup rows. Its owner-local
-- group UUID is intentionally retained when the restore engine remaps entry IDs.
do $$ declare definition text; updated text; signature text; begin
 select pg_get_functiondef('public.export_library_backup()'::regprocedure) into definition;
 updated:=replace(definition,
  $old$case when exists(select 1 from public.library_entries where user_id=owner_id and source_url is not null) then 2 else 1 end$old$,
  $new$case when exists(select 1 from public.library_entries where user_id=owner_id and crosspost_group_id is not null) then 3
   when exists(select 1 from public.library_entries where user_id=owner_id and source_url is not null) then 2 else 1 end$new$);
 updated:=replace(updated,$old$if t='metadata_jobs' then$old$,$new$if t='library_entries' then
   select coalesce(jsonb_agg(case when r->>'crosspost_group_id' is null then r-array['crosspost_group_id','crosspost_order'] else r end),'[]')
   into rows from jsonb_array_elements(rows) r;
  end if;
  if t='metadata_jobs' then$new$);
 if updated not like '%then 3%' or updated not like '%r-array%crosspost_order%' then raise exception 'Review crosspost backup export'; end if;
 execute updated;
 foreach signature in array array['public.validate_account_backup(jsonb)','public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  updated:=replace(definition,$old$not in ('1','2')$old$,$new$not in ('1','2','3')$new$);
  updated:=replace(updated,$old$p_backup->>'version'<>'2'$old$,$new$p_backup->>'version' not in ('2','3')$new$);
  updated:=replace(updated,$old$raise exception 'Unsupported backup format'; end if;$old$,$new$raise exception 'Unsupported backup format'; end if;
  if exists(select 1 from jsonb_array_elements(p_backup->'tables'->'library_entries') e where e->>'crosspost_group_id' is not null) then
   if p_backup->>'version'<>'3' then raise exception 'Linked stories require a version 3 backup'; end if;
   if exists(select 1 from jsonb_array_elements(p_backup->'tables'->'library_entries') e
    where e->>'crosspost_group_id' is not null
    group by (e->>'crosspost_group_id')::uuid having count(*) not between 2 and 25) then
    raise exception 'Invalid crosspost group in backup';
   end if;
  end if;$new$);
  if updated not like '%not in (''1'',''2'',''3'')%' or updated not like '%Invalid crosspost group%' then
   raise exception 'Review crosspost backup reader: %',signature;
  end if;
  execute updated;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
