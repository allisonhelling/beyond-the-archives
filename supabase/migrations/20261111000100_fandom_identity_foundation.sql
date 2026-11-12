begin;

-- Public, rebuildable evidence only. No owner, saved-work or lookup-history data.
-- No runtime policy cutover: the accessible AO3 template cannot verify empty
-- metatag lists. This migration deliberately publishes no work classifications.
create table public.canonical_fandoms (
 id uuid primary key default gen_random_uuid(),
 preferred_display_name text not null check(length(preferred_display_name) between 1 and 10000),
 created_at timestamptz not null default now()
);
create table public.external_fandom_mappings (
 source_site text not null check(length(source_site) between 1 and 100),
 source_category text not null check(length(source_category) between 1 and 100),
 identity_scheme text not null check(length(identity_scheme) between 1 and 100),
 source_key text not null check(length(source_key) between 1 and 10000),
 canonical_fandom_id uuid not null references public.canonical_fandoms(id),
 mapping_state text not null check(mapping_state in ('verified','disputed')),
 verification_method text not null,
 evidence_ref text not null,
 verified_at timestamptz not null default now(),
 mapping_revision bigint not null default 1 check(mapping_revision>0),
 primary key(source_site,source_category,identity_scheme,source_key)
);
create index external_fandom_internal_id on public.external_fandom_mappings(canonical_fandom_id);

create table public.ao3_fandom_profiles (
 name text primary key check(length(name) between 1 and 10000),
 canonical_name text check(length(canonical_name) between 1 and 10000),
 status text not null check(status in ('canonical','synonym','custom','unverified')),
 aliases text[] not null default '{}',
 -- Source links are observations, not verified edges: parent profiles still
 -- need independent fandom-category and canonical-identity verification.
 metatag_names text[] not null default '{}',
 hierarchy_state text not null check(hierarchy_state in ('missing','observed','malformed')),
 hierarchy_complete boolean not null default false check(not hierarchy_complete),
 parser_version text not null check(parser_version='ao3_fandom_profile_v1'),
 profile_url text not null check(profile_url like 'https://archiveofourown.org/tags/%'),
 checked_at timestamptz,
 attempted_at timestamptz not null default now(),
 last_failure_at timestamptz,
 disputed boolean not null default false,
 evidence_revision bigint not null default 1 check(evidence_revision>0),
 check((status='canonical' and canonical_name=name) or (status='synonym' and canonical_name<>name) or (status in ('custom','unverified') and canonical_name is null)),
 check(status not in ('canonical','synonym') or canonical_name is not null),
 check(cardinality(aliases)<=1000 and cardinality(metatag_names)<=256)
);

alter table public.canonical_fandoms enable row level security;
alter table public.canonical_fandoms force row level security;
alter table public.external_fandom_mappings enable row level security;
alter table public.external_fandom_mappings force row level security;
alter table public.ao3_fandom_profiles enable row level security;
alter table public.ao3_fandom_profiles force row level security;
revoke all on public.canonical_fandoms,public.external_fandom_mappings,public.ao3_fandom_profiles from public,anon,authenticated;
grant all on public.canonical_fandoms,public.external_fandom_mappings,public.ao3_fandom_profiles to service_role;

create function public.store_fandom_profile(p_profile jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
 n text:=p_profile->>'name'; canonical text:=p_profile->>'canonical_name'; s text:=p_profile->>'status';
 aliases text[]; parents text[]; prior public.ao3_fandom_profiles;
 target_id uuid; alias_name text; old_id uuid; is_conflict boolean:=false; alias_conflict boolean;
begin
 if jsonb_typeof(p_profile) is distinct from 'object'
  or n is null or length(btrim(n))=0 or length(n)>10000
  or s is null or s not in ('canonical','synonym','custom','unverified')
  or p_profile->>'parser_version' is distinct from 'ao3_fandom_profile_v1'
  or p_profile->'hierarchy_complete' is distinct from 'false'::jsonb
  or coalesce(p_profile->>'hierarchy_state','') not in ('missing','observed','malformed')
  or coalesce(p_profile->>'profile_url','') not like 'https://archiveofourown.org/tags/%'
  or jsonb_typeof(p_profile->'aliases') is distinct from 'array'
  or jsonb_typeof(p_profile->'metatag_names') is distinct from 'array'
 then raise exception 'Invalid fandom profile'; end if;
 if jsonb_array_length(p_profile->'aliases')>1000 or jsonb_array_length(p_profile->'metatag_names')>256
  or exists(select 1 from jsonb_array_elements((p_profile->'aliases')||(p_profile->'metatag_names')) v where jsonb_typeof(v) is distinct from 'string' or length(btrim(v#>>'{}'))=0 or length(v#>>'{}')>10000)
 then raise exception 'Invalid fandom links'; end if;
 select coalesce(array_agg(distinct value),'{}') into aliases from jsonb_array_elements_text(p_profile->'aliases');
 select coalesce(array_agg(distinct value),'{}') into parents from jsonb_array_elements_text(p_profile->'metatag_names');
 if (s='canonical' and canonical is distinct from n)
  or (s='synonym' and (canonical is null or canonical=n))
  or (s in ('custom','unverified') and canonical is not null)
  or (s<>'canonical' and (cardinality(aliases)>0 or cardinality(parents)>0))
  or (cardinality(parents)>0 and p_profile->>'hierarchy_state'<>'observed')
  or n=any(parents)
 then raise exception 'Inconsistent fandom profile'; end if;

 -- Serialize alias/root publication so concurrent requests cannot allocate
 -- competing app identities. The existing global network gate bounds writes.
 perform pg_advisory_xact_lock(611110001);
 select * into prior from public.ao3_fandom_profiles where name=n;
 if s='unverified' then
  insert into public.ao3_fandom_profiles(name,status,hierarchy_state,parser_version,profile_url,last_failure_at)
   values(n,s,'missing',p_profile->>'parser_version',p_profile->>'profile_url',now())
   on conflict(name) do update set attempted_at=now(),last_failure_at=now();
  return;
 end if;
 is_conflict:=coalesce(prior.disputed,false) or (prior.canonical_name is not null and prior.canonical_name is distinct from canonical);
 -- Every fetch is incomplete for negative proof. Preserve prior positive links;
 -- a missing/malformed/partial fetch must never delete verified observations.
 select coalesce(array_agg(distinct p),'{}') into parents from unnest(parents||coalesce(prior.metatag_names,'{}')) p;
 insert into public.ao3_fandom_profiles(name,canonical_name,status,aliases,metatag_names,hierarchy_state,parser_version,profile_url,checked_at,disputed)
  values(n,canonical,s,aliases,parents,p_profile->>'hierarchy_state',p_profile->>'parser_version',p_profile->>'profile_url',now(),is_conflict)
  on conflict(name) do update set canonical_name=excluded.canonical_name,status=excluded.status,aliases=excluded.aliases,
   metatag_names=excluded.metatag_names,hierarchy_state=excluded.hierarchy_state,parser_version=excluded.parser_version,
   profile_url=excluded.profile_url,checked_at=now(),attempted_at=now(),disputed=excluded.disputed,
   evidence_revision=ao3_fandom_profiles.evidence_revision+case when
    (ao3_fandom_profiles.canonical_name,ao3_fandom_profiles.status,ao3_fandom_profiles.aliases,ao3_fandom_profiles.metatag_names,ao3_fandom_profiles.hierarchy_state,ao3_fandom_profiles.disputed)
    is distinct from (excluded.canonical_name,excluded.status,excluded.aliases,excluded.metatag_names,excluded.hierarchy_state,excluded.disputed) then 1 else 0 end;

 if is_conflict or s='custom' then
  update public.external_fandom_mappings set mapping_state='disputed',mapping_revision=mapping_revision+1
   where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and source_key=n and mapping_state<>'disputed';
  return;
 end if;
 select canonical_fandom_id into target_id from public.external_fandom_mappings
  where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and source_key=canonical and mapping_state='verified';
 if s='canonical' and target_id is null then
  -- Disputed identities are quarantined rather than silently remapped/merged.
  if exists(select 1 from public.external_fandom_mappings where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and source_key=n) then return; end if;
  insert into public.canonical_fandoms(preferred_display_name) values(n) returning id into target_id;
 end if;
 if target_id is null then return; end if; -- Synonym target still needs its own verified profile.
 if not exists(select 1 from public.ao3_fandom_profiles where name=canonical and status='canonical' and not disputed) then return; end if;
 for alias_name in
  select distinct a from (
   select unnest(array[n]||case when s='canonical' then aliases else '{}'::text[] end) a
   union all select name from public.ao3_fandom_profiles where s='canonical' and canonical_name=n and status='synonym' and not disputed
  ) candidates
 loop
  select canonical_fandom_id into old_id from public.external_fandom_mappings
   where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and source_key=alias_name;
  alias_conflict:=(old_id is not null and old_id is distinct from target_id) or exists(
   select 1 from public.ao3_fandom_profiles where name=alias_name and
    (disputed or status='custom' or (canonical_name is not null and canonical_name is distinct from canonical)));
  insert into public.external_fandom_mappings(source_site,source_category,identity_scheme,source_key,canonical_fandom_id,mapping_state,verification_method,evidence_ref)
   values('ao3','fandom','ao3_tag_profile_v1',alias_name,target_id,case when alias_conflict then 'disputed' else 'verified' end,'ao3_fandom_profile_v1',p_profile->>'profile_url')
   on conflict(source_site,source_category,identity_scheme,source_key) do update set
    mapping_state=case when alias_conflict then 'disputed' else external_fandom_mappings.mapping_state end,
    mapping_revision=external_fandom_mappings.mapping_revision+case when alias_conflict and external_fandom_mappings.mapping_state<>'disputed' then 1 else 0 end;
 end loop;
end $$;
revoke all on function public.store_fandom_profile(jsonb) from public,anon,authenticated;
grant execute on function public.store_fandom_profile(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
