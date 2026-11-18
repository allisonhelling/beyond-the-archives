begin;

create table public.tag_classification_rules (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 version integer not null check(version > 0),
 label text not null check(char_length(label) between 1 and 10000 and btrim(label) <> '' and label !~ '[[:cntrl:]]'),
 category text not null check(category in ('fandom','character','relationship','freeform','unknown')),
 scope text not null check(scope in ('story','site_fandom','site','fandom','global')),
 site text,
 fandom text check(char_length(fandom) between 1 and 10000 and btrim(fandom) <> '' and fandom !~ '[[:cntrl:]]'),
 story_id uuid,
 priority integer check(priority between -1000 and 1000),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,id),
 foreign key(story_id,user_id) references public.library_entries(id,user_id) on delete cascade,
 check((site is not null)=(scope in ('site','site_fandom'))),
 check((fandom is not null)=(scope in ('fandom','site_fandom'))),
 check((story_id is not null)=(scope='story')),
 check(site is null or site='ao3' or (site ~ '^https?://[^/?#]+$' and public.manual_story_url(site||'/')=site||'/'))
);
create index tag_classification_rules_story on public.tag_classification_rules(story_id) where story_id is not null;
alter table public.tag_classification_rules enable row level security;
alter table public.tag_classification_rules force row level security;
revoke all on public.tag_classification_rules from public,anon,authenticated;
grant select on public.tag_classification_rules to authenticated;
create policy owner_read on public.tag_classification_rules for select to authenticated using(user_id=(select auth.uid()));

create function public.tag_classification_revision() returns text
language sql stable set search_path='' as $$
 select count(*)::text||':'||coalesce(max(updated_at)::text,'')
 from public.tag_classification_rules where user_id=(select auth.uid());
$$;
revoke all on function public.tag_classification_revision() from public,anon;
grant execute on function public.tag_classification_revision() to authenticated;

create function public.write_tag_classification_rule(p_id uuid,p_version integer,p_rule jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); target uuid:= (p_rule->>'story_id')::uuid;
begin
 if owner_id is null then raise exception 'Sign in to edit classification rules' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version < 0 then raise exception 'Invalid classification rule revision' using errcode='22023'; end if;
 if target is not null and not exists(select 1 from public.library_entries where id=target and user_id=owner_id) then
  raise exception 'Story is unavailable' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':tag-classification',0));
 if p_rule is null then
  delete from public.tag_classification_rules where id=p_id and user_id=owner_id and version=p_version;
 else
  if jsonb_typeof(p_rule) is distinct from 'object' or octet_length(p_rule::text)>90000
    or jsonb_typeof(p_rule->'enabled') is distinct from 'boolean' then
   raise exception 'Invalid classification rule' using errcode='22023';
  end if;
  if p_version=0 then
   insert into public.tag_classification_rules(user_id,id,version,label,category,scope,site,fandom,story_id,priority,enabled)
   values(owner_id,p_id,1,p_rule->>'label',p_rule->>'category',p_rule->>'scope',p_rule->>'site',
    p_rule->>'fandom',target,(p_rule->>'priority')::integer,(p_rule->>'enabled')::boolean)
   on conflict do nothing;
  else
   update public.tag_classification_rules set version=p_version+1,label=p_rule->>'label',
    category=p_rule->>'category',scope=p_rule->>'scope',site=p_rule->>'site',fandom=p_rule->>'fandom',
    story_id=target,priority=(p_rule->>'priority')::integer,enabled=(p_rule->>'enabled')::boolean,updated_at=now()
   where id=p_id and user_id=owner_id and version=p_version;
  end if;
 end if;
 return found;
end;
$$;
revoke all on function public.write_tag_classification_rule(uuid,integer,jsonb) from public,anon;
grant execute on function public.write_tag_classification_rule(uuid,integer,jsonb) to authenticated;

create function public.reset_tag_classification_rules(p_revision text) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Sign in to reset classification rules' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':tag-classification',0));
 if public.tag_classification_revision() is distinct from p_revision then return false; end if;
 delete from public.tag_classification_rules where user_id=owner_id;
 return true;
end $$;
revoke all on function public.reset_tag_classification_rules(text) from public,anon;
grant execute on function public.reset_tag_classification_rules(text) to authenticated;

-- Read source evidence directly from existing observations and source links,
-- before the metadata document overlays any accepted personal edit.
create function public.story_tag_evidence(p_story uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with entry as (
  select e.*,w.ao3_work_id
  from public.library_entries e join public.works w on w.id=e.work_id
  where e.id=p_story and e.user_id=(select auth.uid())
 ),
 native as (
  select category, label, position
  from entry e cross join lateral (
   select t.category::text category,t.name label,l.source_position position
   from public.work_tags l join public.tags t on t.id=l.tag_id
   where l.work_id=e.work_id and t.category in ('relationship','character','freeform')
    and not e.extension_metadata ? 'ao3_tags'
   union all
   select 'fandom',f.name,null from public.work_fandoms l join public.fandoms f on f.id=l.fandom_id
   where l.work_id=e.work_id and not e.extension_metadata ? 'fandoms'
   union all
   select field.category,array_tag.label,(select min(a.position)::integer
    from jsonb_array_elements_text(case when jsonb_typeof(e.extension_metadata->'ao3_tags')='array' then e.extension_metadata->'ao3_tags' else '[]'::jsonb end) with ordinality a(label,position)
    where a.label=array_tag.label)
   from (values ('fandoms','fandom'),('relationship_tags','relationship'),('character_tags','character'),('additional_tags','freeform')) field(key,category)
   cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.extension_metadata->field.key)='array' then e.extension_metadata->field.key else '[]'::jsonb end) array_tag(label)
   union all
   select null,array_tag.label,array_tag.position::integer
   from jsonb_array_elements_text(case when jsonb_typeof(e.extension_metadata->'ao3_tags')='array' then e.extension_metadata->'ao3_tags' else '[]'::jsonb end) with ordinality array_tag(label,position)
   where not exists (
    select 1 from unnest(array['relationship_tags','character_tags','additional_tags','archive_warnings','categories','fandoms']) k
    where coalesce(e.extension_metadata->k,'[]') ? array_tag.label
   )
  ) tags
  where e.ao3_work_id is not null and e.source_url is null
 ),
 foreign_tags as (
  select category,tag label,position::integer
  from entry e cross join (values ('fandoms','fandom'),('relationship_tags','relationship'),('character_tags','character'),('additional_tags','freeform'),('ao3_tags',null)) field(key,category)
  cross join lateral regexp_split_to_table(coalesce(e.extension_metadata->'generic_observations'->field.key->>'rawText',e.extension_metadata->'generic_observations'->field.key->>'text'),E'\n') with ordinality tags(tag,position)
  where e.source_url is not null and btrim(tag)<>''
 ),
 tags as (select * from native union all select * from foreign_tags),
 fandom_names as (
  select distinct verified.name
  from native tag join public.ao3_fandom_profiles profile on profile.name=tag.label
  join public.ao3_fandom_profiles root on root.name=profile.canonical_name and root.status='canonical' and not root.disputed
  cross join lateral (values (profile.name),(root.name)) verified(name)
  where tag.category='fandom' and not profile.disputed and profile.status in ('synonym','canonical')
 ),
 fandom_canonical as (
  select profile.name,profile.canonical_name,profile.status,profile.checked_at,profile.attempted_at
  from fandom_names n join public.ao3_fandom_profiles profile on profile.name=n.name
  where profile.checked_at is not null
 )
 select jsonb_build_object(
  'site', case when e.ao3_work_id is not null and e.source_url is null then 'ao3' else substring(e.source_url from '^https?://[^/?#]+') end,
  'canonicalFandoms',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('category','fandom')) from fandom_canonical f),'[]'),
  'tags',coalesce((select jsonb_agg(jsonb_build_object('label',label,'sourceCategory',category,'position',position)
   order by position nulls last,category,label collate "C") from tags where label is not null),'[]')
 )
 from entry e;
$$;
revoke all on function public.story_tag_evidence(uuid) from public,anon;
grant execute on function public.story_tag_evidence(uuid) to authenticated;
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.save_companion_story(uuid,text,jsonb,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'''ao3_tags'',''categories''','''ao3_tags'',''relationship_tags'',''character_tags'',''additional_tags'',''categories''');
 if definition=updated then raise exception 'Review source tag observation fields'; end if;
 updated:=replace(updated,$old$item.value-'text'-'via'<>'{}'::jsonb$old$, $new$item.value-'text'-'via'-'rawText'<>'{}'::jsonb
   or (item.value ? 'rawText' and (item.key not in ('fandoms','ao3_tags','relationship_tags','character_tags','additional_tags')
    or jsonb_typeof(item.value->'rawText') is distinct from 'string' or char_length(item.value->>'rawText')>500))$new$);
 if position('rawText' in updated)=0 then raise exception 'Review raw tag observation fields'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
