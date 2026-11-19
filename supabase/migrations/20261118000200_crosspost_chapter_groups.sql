begin;

create table public.crosspost_chapter_groups (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 left_entry uuid not null,
 right_entry uuid not null,
 left_chapters text[] not null,
 right_chapters text[] not null,
 left_structure text not null,
 right_structure text not null,
 state text not null check(state in ('confirmed','unmatched','unknown')),
 version integer not null check(version>0),
 foreign key(left_entry,user_id) references public.library_entries(id,user_id) on delete cascade,
 foreign key(right_entry,user_id) references public.library_entries(id,user_id) on delete cascade,
 check(left_entry<right_entry),
 check(cardinality(left_chapters)<=100 and cardinality(right_chapters)<=100),
 check(case state when 'confirmed' then
  cardinality(left_chapters)>0 and cardinality(right_chapters)>0
  and least(cardinality(left_chapters),cardinality(right_chapters))=1
  when 'unmatched' then (cardinality(left_chapters)=0)<>(cardinality(right_chapters)=0)
  else cardinality(left_chapters)+cardinality(right_chapters)>0 end)
);
create index crosspost_chapters_by_pair on public.crosspost_chapter_groups(user_id,left_entry,right_entry);
create index crosspost_chapters_by_right on public.crosspost_chapter_groups(right_entry,user_id);
alter table public.crosspost_chapter_groups enable row level security;
alter table public.crosspost_chapter_groups force row level security;
revoke all on public.crosspost_chapter_groups from public,anon,authenticated;
-- Expose evidence only through the pair-scoped reader below. All mutations are checked RPCs.

create function public.crosspost_chapter_structure(p_story jsonb) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(p_story->'work'->'verified_chapters',p_story->'metadata'->'published_chapters')::text);
$$;

create function public.crosspost_chapter_ordinals(p_story jsonb,p_chapters text[]) returns integer[]
language sql immutable set search_path='' as $$
 select array(
  select min(case when key~'^[1-9][0-9]{0,5}$' then key::integer end)
  from jsonb_each_text(case when jsonb_typeof(p_story->'work'->'verified_chapters')='object'
   then p_story->'work'->'verified_chapters' else '{}'::jsonb end)
  where value=any(p_chapters)
   and case when key~'^[1-9][0-9]{0,5}$' then key::integer<=least((p_story->'metadata'->>'published_chapters')::integer,100000) else false end
  group by value having count(*)=1 order by 1
 );
$$;

create function public.story_chapter_groups(p_left uuid,p_right uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'left_chapters',g.left_chapters,'right_chapters',g.right_chapters,
  'state',g.state,'version',g.version,'current',g.left_structure=public.crosspost_chapter_structure(l.story)
   and g.right_structure=public.crosspost_chapter_structure(r.story)) order by g.id),'[]')
 from public.crosspost_chapter_groups g
 join public.library_entries a on a.id=g.left_entry and a.user_id=g.user_id
 join public.library_entries b on b.id=g.right_entry and b.user_id=g.user_id and b.crosspost_group_id=a.crosspost_group_id
 join public.library_search_documents l on l.id=a.id
 join public.library_search_documents r on r.id=b.id
 where g.user_id=(select auth.uid()) and g.left_entry=least(p_left,p_right) and g.right_entry=greatest(p_left,p_right);
$$;

create function public.write_story_chapter_group(p_left uuid,p_right uuid,p_id uuid,p_version integer,
 p_left_chapters text[] default null,p_right_chapters text[] default null,p_state text default null,p_review jsonb default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid();
 left_story jsonb;
 right_story jsonb;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if p_left is null or p_right is null or p_left>=p_right or p_id is null or p_version is null or p_version<0 then
  raise exception 'Choose two different versions and review their chapters' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 select l.story,r.story into left_story,right_story
 from public.library_entries a join public.library_entries b on b.user_id=a.user_id and b.crosspost_group_id=a.crosspost_group_id
 join public.library_search_documents l on l.id=a.id
 join public.library_search_documents r on r.id=b.id
 where a.user_id=owner_id and a.id=p_left and b.id=p_right;
 if not found then raise insufficient_privilege; end if;
 if p_state is null then
  delete from public.crosspost_chapter_groups
  where id=p_id and user_id=owner_id and left_entry=p_left and right_entry=p_right and version=p_version;
 else
  if p_review is distinct from jsonb_build_array(left_story->'work'->'verified_chapters',left_story->'metadata'->'published_chapters',
   right_story->'work'->'verified_chapters',right_story->'metadata'->'published_chapters') then
   raise exception 'Chapter structure changed. Compare the current indexes again.' using errcode='40001';
  end if;
  if p_state not in ('confirmed','unknown','unmatched') or p_left_chapters is null or p_right_chapters is null
   or cardinality(p_left_chapters)<>cardinality(public.crosspost_chapter_ordinals(left_story,p_left_chapters))
   or cardinality(p_right_chapters)<>cardinality(public.crosspost_chapter_ordinals(right_story,p_right_chapters)) then
   raise exception 'Choose chapters from each current verified chapter index' using errcode='22023';
  end if;
  if p_version=0 then
   insert into public.crosspost_chapter_groups(id,user_id,left_entry,right_entry,left_chapters,right_chapters,left_structure,right_structure,state,version)
   values(p_id,owner_id,p_left,p_right,p_left_chapters,p_right_chapters,
    public.crosspost_chapter_structure(left_story),public.crosspost_chapter_structure(right_story),p_state,1)
   on conflict(id) do nothing;
  else
   update public.crosspost_chapter_groups set left_chapters=p_left_chapters,right_chapters=p_right_chapters,
    left_structure=public.crosspost_chapter_structure(left_story),right_structure=public.crosspost_chapter_structure(right_story),
    state=p_state,version=version+1
   where id=p_id and user_id=owner_id and left_entry=p_left and right_entry=p_right and version=p_version;
  end if;
 end if;
 return found;
end;
$$;

-- Compute a transferable prefix from confirmed stable-ID groups. A split or
-- merged group only contributes when its entire source side has been read.
create function public.mark_corresponding_chapters_read(p_source uuid,p_target uuid,p_revision text,p_groups jsonb,p_apply boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid();
 source_story jsonb;
 target_story jsonb;
 source_progress integer;
 target_progress integer;
 next_progress integer;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if p_source is null or p_target is null or p_source=p_target then
  raise exception 'Choose two different linked versions' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 perform id from public.library_entries where user_id=owner_id and id in (p_source,p_target) order by id for update;
 select s.story,t.story,a.last_read_chapter,b.last_read_chapter
 into source_story,target_story,source_progress,target_progress
 from public.library_entries a join public.library_entries b on b.user_id=a.user_id and b.crosspost_group_id=a.crosspost_group_id
 join public.library_search_documents s on s.id=a.id
 join public.library_search_documents t on t.id=b.id
 where a.user_id=owner_id and a.id=p_source and b.id=p_target;
 if not found then raise insufficient_privilege; end if;
 if p_revision is null or p_revision is distinct from (public.story_versions(p_source)->>'revision')
  or p_groups is distinct from public.story_chapter_groups(p_source,p_target) then
  raise exception 'Progress changed. Review the current versions before saving.' using errcode='40001';
 end if;
 with chapter_groups as (
  select case when p_source=g.left_entry then public.crosspost_chapter_ordinals(source_story,g.left_chapters)
    else public.crosspost_chapter_ordinals(source_story,g.right_chapters) end source_ordinals,
   case when p_source=g.left_entry then public.crosspost_chapter_ordinals(target_story,g.right_chapters)
    else public.crosspost_chapter_ordinals(target_story,g.left_chapters) end target_ordinals,
   case when p_source=g.left_entry then cardinality(g.left_chapters) else cardinality(g.right_chapters) end source_count,
   case when p_source=g.left_entry then cardinality(g.right_chapters) else cardinality(g.left_chapters) end target_count
  from public.crosspost_chapter_groups g
  where g.user_id=owner_id and g.left_entry=least(p_source,p_target) and g.right_entry=greatest(p_source,p_target)
   and g.state='confirmed'
   and g.left_structure=public.crosspost_chapter_structure(case when p_source=g.left_entry then source_story else target_story end)
   and g.right_structure=public.crosspost_chapter_structure(case when p_source=g.left_entry then target_story else source_story end)
 ), matched as (
  select distinct ordinal from chapter_groups cross join lateral unnest(target_ordinals) ordinal
  where cardinality(source_ordinals)=source_count and cardinality(target_ordinals)=target_count
   and source_progress>=all(source_ordinals) and ordinal>target_progress
 ), contiguous as (
  select ordinal,row_number() over(order by ordinal) offset_from_progress from matched
 )
 select max(ordinal) into next_progress from contiguous where ordinal=target_progress+offset_from_progress;
 if next_progress is null then return target_progress; end if;
 if p_apply is not true then return next_progress; end if;
 -- The normal entry guards apply. This is a progress adjustment, not a chapter
 -- read event, so no synthetic history, timestamps or word counts are supplied.
 perform set_config('app.reading_intent','preserve',true);
 perform set_config('app.chapter_read','',true);
 update public.library_entries set last_read_chapter=next_progress where id=p_target and user_id=owner_id;
 perform set_config('app.reading_intent','',true);
 return next_progress;
end;
$$;

create function public.clear_unlinked_chapter_groups() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.crosspost_chapter_groups where user_id=old.user_id and old.id in (left_entry,right_entry);
 return null;
end $$;
create trigger clear_unlinked_chapter_groups after update of crosspost_group_id on public.library_entries
 for each row when (old.crosspost_group_id is not null and old.crosspost_group_id is distinct from new.crosspost_group_id)
 execute function public.clear_unlinked_chapter_groups();

-- Restores use the same overlap guard as edits.
create function public.check_crosspost_chapter_overlap() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.crosspost_chapter_groups g
  where g.user_id=new.user_id and g.left_entry=new.left_entry and g.right_entry=new.right_entry and g.id<>new.id
   and (g.left_chapters&&new.left_chapters or g.right_chapters&&new.right_chapters)) then
  raise exception 'These chapters already belong to another group' using errcode='22023';
 end if;
 return new;
end $$;
create trigger check_crosspost_chapter_overlap before insert or update on public.crosspost_chapter_groups
 for each row execute function public.check_crosspost_chapter_overlap();

revoke all on function public.crosspost_chapter_structure(jsonb),public.crosspost_chapter_ordinals(jsonb,text[]),
 public.story_chapter_groups(uuid,uuid),public.write_story_chapter_group(uuid,uuid,uuid,integer,text[],text[],text,jsonb),
 public.mark_corresponding_chapters_read(uuid,uuid,text,jsonb,boolean),public.clear_unlinked_chapter_groups(),
 public.check_crosspost_chapter_overlap() from public,anon,authenticated;
grant execute on function public.story_chapter_groups(uuid,uuid),public.write_story_chapter_group(uuid,uuid,uuid,integer,text[],text[],text,jsonb),
 public.mark_corresponding_chapters_read(uuid,uuid,text,jsonb,boolean) to authenticated;

create table public.crosspost_story_states (
 user_id uuid not null references auth.users(id) on delete cascade,
 group_id uuid not null,
 status public.reading_status,
 dismissed_state text,
 primary key(user_id,group_id)
);
alter table public.crosspost_story_states enable row level security;
alter table public.crosspost_story_states force row level security;
revoke all on public.crosspost_story_states from public,anon,authenticated;

-- Confidence requires current mappings to cover both verified chapter indexes.
-- Metadata resemblance and equal counts alone never qualify.
create function public.crosspost_complete_equivalence(p_left jsonb,p_right jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(sum(cardinality(g.left_chapters))=(p_left->'metadata'->>'published_chapters')::integer
  and sum(cardinality(g.right_chapters))=(p_right->'metadata'->>'published_chapters')::integer
  and bool_and(cardinality(g.left_chapters)=cardinality(public.crosspost_chapter_ordinals(p_left,g.left_chapters))
   and cardinality(g.right_chapters)=cardinality(public.crosspost_chapter_ordinals(p_right,g.right_chapters))),false)
 from public.crosspost_chapter_groups g
 where g.user_id=(select auth.uid()) and g.left_entry=(p_left->>'id')::uuid and g.right_entry=(p_right->>'id')::uuid
  and g.state='confirmed' and g.left_structure=public.crosspost_chapter_structure(p_left)
  and g.right_structure=public.crosspost_chapter_structure(p_right);
$$;

create function public.story_completion(p_entry uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with anchor as (
  select user_id,crosspost_group_id
  from public.library_entries where id=p_entry and user_id=(select auth.uid()) and crosspost_group_id is not null
 ), versions as (
  select e.id,d.story,e.original_url,e.last_read_chapter progress,e.reading_status,
   (d.story->'metadata'->>'published_chapters')::integer published
  from anchor a join public.library_entries e on e.user_id=a.user_id and e.crosspost_group_id=a.crosspost_group_id
  join public.library_search_documents d on d.id=e.id
 ), pairs as (
  select l.id left_id,r.id right_id,exists(
   select 1 from public.crosspost_chapter_groups g
   where g.user_id=(select auth.uid()) and g.left_entry=l.id and g.right_entry=r.id and g.state='confirmed'
    and g.left_structure=public.crosspost_chapter_structure(l.story) and g.right_structure=public.crosspost_chapter_structure(r.story)
  ) reviewed, public.crosspost_complete_equivalence(l.story,r.story) equivalent
  from versions l join versions r on l.id<r.id
 ), completion as (
  select v.id,v.progress,v.published,v.reading_status,
   v.published>0 and v.progress>=v.published and v.reading_status in ('finished','waiting_for_updates','reading','re_reading') caught_up,
   v.published>0 and v.progress>=v.published and v.reading_status='finished'
    and v.story->'metadata'->>'publication_status'='complete'
    and v.story->'metadataConfidence'->>'publication_status' in ('verified','manual') source_finished
  from versions v
 ), summary as (
  select (select count(*) from versions) count,
   exists(select 1 from completion where source_finished)
    and (select bool_and(equivalent) from pairs) equivalent_finished,
   exists(select 1 from completion c join pairs p on c.id in (p.left_id,p.right_id) and p.reviewed
    join completion other on other.id=case when c.id=p.left_id then p.right_id else p.left_id end
    where c.caught_up and not coalesce(other.caught_up,false)) divergent,
   (select md5(jsonb_agg(jsonb_build_array(original_url,progress,published,reading_status,
    story->'metadata'->'publication_status') order by original_url)::text) from versions) prompt_key
 )
 select jsonb_build_object('status',coalesce(s.status,case when summary.equivalent_finished then 'finished'::public.reading_status end),
  'override',s.status,'prompt',case when s.status is null and summary.divergent and not summary.equivalent_finished
   and s.dismissed_state is distinct from summary.prompt_key then summary.prompt_key end)
 from anchor a cross join summary left join public.crosspost_story_states s on s.user_id=a.user_id and s.group_id=a.crosspost_group_id
 where summary.count>1;
$$;

create function public.write_story_completion(p_entry uuid,p_status public.reading_status,p_expected jsonb,p_review text default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); group_id uuid; review jsonb;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':story-versions',0));
 select crosspost_group_id into group_id from public.library_entries where id=p_entry and user_id=owner_id;
 if group_id is null then raise insufficient_privilege; end if;
 perform id from public.library_entries e where e.user_id=owner_id and e.crosspost_group_id=group_id order by id for update;
 review:=public.story_completion(p_entry);
 if review is null then raise insufficient_privilege; end if;
 if review is distinct from p_expected or (p_review is not null and review->>'prompt' is distinct from p_review) then
  raise exception 'The completion review changed. Review the current versions.' using errcode='40001';
 end if;
 insert into public.crosspost_story_states as s(user_id,group_id,status,dismissed_state) values(owner_id,group_id,p_status,p_review)
 on conflict on constraint crosspost_story_states_pkey do update set status=excluded.status,
 dismissed_state=coalesce(excluded.dismissed_state,s.dismissed_state);
end $$;

create function public.clear_unlinked_crosspost_state() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.crosspost_story_states s where s.user_id=old.user_id and s.group_id=old.crosspost_group_id
  and (select count(*) from public.library_entries e where e.user_id=s.user_id and e.crosspost_group_id=s.group_id)<2;
 return null;
end $$;
create trigger clear_unlinked_crosspost_state after update of crosspost_group_id on public.library_entries
 for each row when (old.crosspost_group_id is not null and old.crosspost_group_id is distinct from new.crosspost_group_id)
 execute function public.clear_unlinked_crosspost_state();
create trigger clear_removed_crosspost_state after delete on public.library_entries
 for each row when (old.crosspost_group_id is not null) execute function public.clear_unlinked_crosspost_state();

revoke all on function public.crosspost_complete_equivalence(jsonb,jsonb),public.story_completion(uuid),
 public.write_story_completion(uuid,public.reading_status,jsonb,text),public.clear_unlinked_crosspost_state() from public,anon,authenticated;
grant execute on function public.story_completion(uuid),public.write_story_completion(uuid,public.reading_status,jsonb,text) to authenticated;

-- Version 3 adds reviewed correspondence without adding the table to the
-- legacy required-table list. Source IDs are remapped by the existing restore.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.export_library_backup()'::regprocedure) into definition;
 updated:=replace(definition,$old$return jsonb_build_object('format','between-chapters-backup',$old$,
 $new$if exists(select 1 from public.library_entries where user_id=owner_id and crosspost_group_id is not null) then
  tables:=tables||jsonb_build_object('crosspost_chapter_groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.id)
   from public.crosspost_chapter_groups g where g.user_id=owner_id),'[]'::jsonb),
   'crosspost_story_states',coalesce((select jsonb_agg(to_jsonb(s) order by s.group_id)
   from public.crosspost_story_states s where s.user_id=owner_id),'[]'::jsonb));
 end if;
 return jsonb_build_object('format','between-chapters-backup',$new$);
 if updated=definition then raise exception 'Review chapter correspondence backup export'; end if;
 execute updated;

 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,$old$ return id_map;$old$,$new$
 if data ? 'crosspost_story_states' then
  if p_backup->>'version' is distinct from '3' or jsonb_typeof(data->'crosspost_story_states') is distinct from 'array' then
   raise exception 'Invalid crosspost reading status backup';
  end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.crosspost_story_states,data->'crosspost_story_states') s
   where s.user_id is distinct from source_id or (select count(*) from public.library_entries e where e.user_id=p_user and e.crosspost_group_id=s.group_id)<2)
   then raise exception 'Invalid crosspost status ownership or link'; end if;
 end if;
 delete from public.crosspost_story_states s where s.user_id=p_user;
 if data ? 'crosspost_story_states' then
  insert into public.crosspost_story_states(user_id,group_id,status,dismissed_state)
  select p_user,s.group_id,s.status,s.dismissed_state
  from jsonb_populate_recordset(null::public.crosspost_story_states,data->'crosspost_story_states') s;
 end if;
 if data ? 'crosspost_chapter_groups' then
  if p_backup->>'version' is distinct from '3' or jsonb_typeof(data->'crosspost_chapter_groups') is distinct from 'array' then
   raise exception 'Invalid chapter correspondence backup';
  end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.crosspost_chapter_groups,data->'crosspost_chapter_groups') g
   where g.user_id is distinct from source_id or not exists(
    select 1 from jsonb_array_elements(data->'library_entries') e where e->>'id'=g.left_entry::text
   ) or not exists(
    select 1 from jsonb_array_elements(data->'library_entries') e where e->>'id'=g.right_entry::text
   ) or not exists(
    select 1 from public.library_entries a join public.library_entries b on a.user_id=b.user_id and a.crosspost_group_id=b.crosspost_group_id
    where a.user_id=p_user and a.id=(id_map->>g.left_entry::text)::uuid and b.id=(id_map->>g.right_entry::text)::uuid
   )) then raise exception 'Invalid chapter correspondence ownership or link'; end if;
  insert into public.crosspost_chapter_groups(id,user_id,left_entry,right_entry,left_chapters,right_chapters,left_structure,right_structure,state,version)
  select gen_random_uuid(),p_user,least(a.id,b.id),greatest(a.id,b.id),
    case when a.id<b.id then g.left_chapters else g.right_chapters end,
    case when a.id<b.id then g.right_chapters else g.left_chapters end,
    case when a.id<b.id then g.left_structure else g.right_structure end,
    case when a.id<b.id then g.right_structure else g.left_structure end,g.state,g.version
  from jsonb_populate_recordset(null::public.crosspost_chapter_groups,data->'crosspost_chapter_groups') g
  join public.library_entries a on a.id=(id_map->>g.left_entry::text)::uuid
  join public.library_entries b on b.id=(id_map->>g.right_entry::text)::uuid;
 end if;
 return id_map;$new$);
 -- Same-account operator restores preserve row IDs rather than populating the
 -- private remap. Fall back only to IDs present in the validated backup.
 updated:=replace(replace(updated,
  '(id_map->>g.left_entry::text)::uuid','coalesce((id_map->>g.left_entry::text)::uuid,g.left_entry)'),
  '(id_map->>g.right_entry::text)::uuid','coalesce((id_map->>g.right_entry::text)::uuid,g.right_entry)');
 if updated=definition then raise exception 'Review chapter correspondence restore'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
