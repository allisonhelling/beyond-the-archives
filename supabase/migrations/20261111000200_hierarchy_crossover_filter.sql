begin;

-- Parser v2 recognizes a structurally complete public profile. Intentional
-- omission is a versioned no-direct-metatag observation, not universal absence.
alter table public.ao3_fandom_profiles drop constraint ao3_fandom_profiles_hierarchy_complete_check;
alter table public.ao3_fandom_profiles drop constraint ao3_fandom_profiles_parser_version_check;
alter table public.ao3_fandom_profiles drop constraint ao3_fandom_profiles_hierarchy_state_check;
alter table public.ao3_fandom_profiles add column profile_complete boolean not null default false;
alter table public.ao3_fandom_profiles add column last_complete_at timestamptz;
alter table public.ao3_fandom_profiles add check(parser_version in ('ao3_fandom_profile_v1','ao3_fandom_profile_v2'));
alter table public.ao3_fandom_profiles add check(hierarchy_state in ('missing','observed','malformed','verified_empty'));
alter table public.ao3_fandom_profiles add check(not hierarchy_complete or
 (profile_complete and parser_version='ao3_fandom_profile_v2' and status='canonical' and hierarchy_state in ('observed','verified_empty') and last_complete_at is not null));
delete from public.ao3_fandom_profiles where status='unverified';

alter function public.store_fandom_profile(jsonb) rename to store_fandom_profile_v1;
create function public.store_fandom_profile(p_profile jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare complete boolean:=coalesce((p_profile->>'hierarchy_complete')::boolean,false); n text:=p_profile->>'name';
begin
 -- Failed private candidates are request state, not public AO3 observations.
 if p_profile->>'status'='unverified' and not exists(select 1 from public.ao3_fandom_profiles where name=n) then return; end if;
 if p_profile->>'parser_version'='ao3_fandom_profile_v1' then
  if p_profile->>'status'<>'unverified' then update public.ao3_fandom_profiles set hierarchy_complete=false where name=n and hierarchy_complete; end if;
  perform public.store_fandom_profile_v1(p_profile); return;
 end if;
 if p_profile->>'parser_version' is distinct from 'ao3_fandom_profile_v2' or
  (complete and (p_profile->>'profile_complete' is distinct from 'true' or p_profile->>'status'<>'canonical' or p_profile->>'hierarchy_state' not in ('observed','verified_empty')))
  or (p_profile->>'hierarchy_state'='verified_empty' and p_profile->'metatag_names'<>'[]'::jsonb)
 then raise exception 'Invalid complete fandom evidence'; end if;
 if p_profile->>'status'<>'unverified' then update public.ao3_fandom_profiles set hierarchy_complete=false where name=n and hierarchy_complete; end if;
 perform public.store_fandom_profile_v1(p_profile||jsonb_build_object('parser_version','ao3_fandom_profile_v1','hierarchy_complete',false,
  'hierarchy_state',case when p_profile->>'hierarchy_state'='verified_empty' then 'observed' else p_profile->>'hierarchy_state' end));
 if p_profile->>'status'='unverified' then return; end if;
 update public.ao3_fandom_profiles set parser_version='ao3_fandom_profile_v2',profile_complete=coalesce((p_profile->>'profile_complete')::boolean,false),
  hierarchy_complete=complete,last_complete_at=case when complete then now() else last_complete_at end,
  hierarchy_state=p_profile->>'hierarchy_state',
  metatag_names=case when complete then array(select value from jsonb_array_elements_text(p_profile->'metatag_names') order by value) else metatag_names end,
  evidence_revision=evidence_revision+1
 where name=n;
 -- Refresh only aliases actually observed in this successful profile. An alias
 -- omitted from a potentially limited synonym list must eventually be checked
 -- on its own profile instead of inheriting the root's refresh forever.
 update public.external_fandom_mappings m set verified_at=now()
 where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and mapping_state='verified'
  and source_key=any(array[n]||case when p_profile->>'status'='canonical' then array(select value from jsonb_array_elements_text(p_profile->'aliases')) else '{}'::text[] end);
end $$;
revoke all on function public.store_fandom_profile(jsonb),public.store_fandom_profile_v1(jsonb) from public,anon,authenticated;
grant execute on function public.store_fandom_profile(jsonb) to service_role;

create table public.fandom_evidence_state (
 singleton boolean primary key default true check(singleton), revision bigint not null default 1
);
insert into public.fandom_evidence_state values(true,1);
create table public.fandom_classifications (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null, fandoms text[] not null, verified_empty boolean not null default false,
 status text not null default 'unknown' check(status in ('unknown','crossover','not_crossover')),
 evidence_revision bigint not null default 0, valid_until timestamptz,
 dependency_names text[] not null default '{}', dirty boolean not null default true,
 lease_token uuid, leased_until timestamptz, next_attempt_at timestamptz not null default now(),
 primary key(user_id,key)
);
create index fandom_classification_names on public.fandom_classifications using gin(fandoms);
create index fandom_classification_dependencies on public.fandom_classifications using gin(dependency_names);
create index fandom_classification_expiry on public.fandom_classifications(user_id,valid_until) where status='crossover';
create index fandom_classification_due on public.fandom_classifications(user_id,next_attempt_at) where dirty;
create table public.fandom_resolution_requests (
 user_id uuid not null references auth.users(id) on delete cascade, name text not null,
 next_attempt_at timestamptz not null default now(), leased_until timestamptz,
 primary key(user_id,name)
);
create index fandom_resolution_due on public.fandom_resolution_requests(user_id,next_attempt_at);
alter table public.fandom_evidence_state enable row level security;
alter table public.fandom_evidence_state force row level security;
alter table public.fandom_classifications enable row level security;
alter table public.fandom_classifications force row level security;
alter table public.fandom_resolution_requests enable row level security;
alter table public.fandom_resolution_requests force row level security;
revoke all on public.fandom_evidence_state,public.fandom_classifications,public.fandom_resolution_requests from public,anon,authenticated;
grant all on public.fandom_evidence_state,public.fandom_classifications,public.fandom_resolution_requests to service_role;
grant select on public.fandom_classifications to authenticated;
create policy own_fandom_classifications on public.fandom_classifications for select to authenticated using(user_id=(select auth.uid()));

create function public.library_fandom_names(p_fandoms jsonb) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(name order by name),'{}') from
  (select distinct value name from jsonb_array_elements_text(case when jsonb_typeof(p_fandoms)='array' then p_fandoms else '[]' end) where btrim(value)<>'') names;
$$;
create function public.library_fandom_key(p_fandoms jsonb,p_empty boolean default false) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_object('fandoms',public.library_fandom_names(p_fandoms),'verifiedEmpty',coalesce(p_empty,false))::text);
$$;
create function public.fandom_classification_document(p_status text,p_revision bigint,p_until timestamptz) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('crossoverStatus',case when p_status='crossover' and (p_until is null or p_until<=now()) then 'unknown' else coalesce(p_status,'unknown') end,
  'crossoverPolicy','ao3_hierarchy_v1','crossoverClassifierVersion',1,'crossoverEvidenceRevision',coalesce(p_revision,0)::text,'crossoverValidUntil',p_until);
$$;
create function public.ensure_fandom_classification(p_user uuid,p_fandoms jsonb,p_empty boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text:=public.library_fandom_key(p_fandoms,p_empty); names text[]; cached public.fandom_classifications;
begin
 names:=public.library_fandom_names(p_fandoms);
 -- Preserve arbitrary manual/source text without letting oversized candidates
 -- exceed index limits or turn enrichment into a failed story save.
 if cardinality(names)>256 or exists(select 1 from unnest(names) v where octet_length(v)>2000) then
  return public.fandom_classification_document('unknown',0,null);
 end if;
 insert into public.fandom_classifications(user_id,key,fandoms,verified_empty) values(p_user,k,names,coalesce(p_empty,false)) on conflict do nothing;
 insert into public.fandom_resolution_requests(user_id,name) select p_user,n from unnest(names) n on conflict do nothing;
 select * into cached from public.fandom_classifications where user_id=p_user and key=k;
 if cached.fandoms is distinct from names or cached.verified_empty is distinct from coalesce(p_empty,false) then return public.fandom_classification_document('unknown',0,null); end if;
 return public.fandom_classification_document(cached.status,cached.evidence_revision,cached.valid_until);
end $$;
create function public.library_cached_crossover(p_fandoms jsonb,p_empty boolean default false) returns jsonb
language sql stable set search_path='' as $$
 select public.fandom_classification_document(c.status,c.evidence_revision,c.valid_until)
 from (select 1) seed left join public.fandom_classifications c on c.user_id=(select auth.uid()) and c.key=public.library_fandom_key(p_fandoms,p_empty)
  and c.fandoms=public.library_fandom_names(p_fandoms) and c.verified_empty=coalesce(p_empty,false);
$$;

-- Evidence changes enqueue only dependent observation sets. Publication occurs
-- per set in the existing document/membership/revision transaction below.
create function public.fandom_evidence_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare names text[]; ancestors text[]:='{}';
begin
 if tg_table_name='ao3_fandom_profiles' then
  if tg_op='UPDATE' and (old.status,old.canonical_name,old.metatag_names,old.disputed,old.parser_version,old.hierarchy_complete,old.last_complete_at)
   is not distinct from (new.status,new.canonical_name,new.metatag_names,new.disputed,new.parser_version,new.hierarchy_complete,new.last_complete_at) then return null; end if;
  names:=array[coalesce(new.name,old.name)];
  if tg_op<>'DELETE' then ancestors:=new.metatag_names||array[new.canonical_name]; end if;
 else
  if coalesce(new.source_site,old.source_site)<>'ao3' or coalesce(new.source_category,old.source_category)<>'fandom' or coalesce(new.identity_scheme,old.identity_scheme)<>'ao3_tag_profile_v1' then return null; end if;
  if tg_op='UPDATE' and (old.canonical_fandom_id,old.mapping_state) is not distinct from (new.canonical_fandom_id,new.mapping_state) then return null; end if;
  names:=array[coalesce(new.source_key,old.source_key)];
 end if;
 update public.fandom_evidence_state set revision=revision+1;
 update public.fandom_classifications set dirty=true,lease_token=null,leased_until=null,next_attempt_at=now()
  where fandoms && names or dependency_names && names;
 insert into public.fandom_resolution_requests(user_id,name)
  select distinct c.user_id,a from public.fandom_classifications c cross join unnest(ancestors) a
  where (c.fandoms && names or c.dependency_names && names) and a is not null
  on conflict do nothing;
 return null;
end $$;
create trigger fandom_profile_changed after insert or update or delete on public.ao3_fandom_profiles for each row execute function public.fandom_evidence_changed();
create trigger fandom_mapping_changed after insert or update or delete on public.external_fandom_mappings for each row execute function public.fandom_evidence_changed();

-- Private observation-set cache: no hierarchy traversal in queries or indexing.
alter table public.library_search_documents add column crossover_key text;
alter table public.library_search_documents add column crossover_status text generated always as (story->>'crossoverStatus') stored;
create index library_crossover_status on public.library_search_documents(user_id,crossover_status,id);
create index library_crossover_observations on public.library_search_documents(user_id,crossover_key);
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.index_library_document()'::regprocedure) into definition;
 updated:=replace(definition,E'begin\n',E'begin\n new.crossover_key:=public.library_fandom_key(new.story->''metadata''->''fandoms'',coalesce(new.story->''metadata_overrides''->''fandoms''=''[]''::jsonb,false));\n new.story:=new.story||public.ensure_fandom_classification(new.user_id,new.story->''metadata''->''fandoms'',coalesce(new.story->''metadata_overrides''->''fandoms''=''[]''::jsonb,false));\n');
 if updated=definition then raise exception 'Review crossover index boundary'; end if;
 execute updated;
end $$;
alter function public.index_library_document() security definer;

create function public.register_series_fandoms() returns trigger
language plpgsql security definer set search_path='' as $$
declare w jsonb;
begin
 for w in select value from jsonb_array_elements(coalesce(new.metadata->'works','[]')) loop
  perform public.ensure_fandom_classification(new.user_id,w->'fandoms',false);
 end loop;
 return null;
end $$;
create trigger series_fandom_observations after insert or update of metadata on public.library_series for each row execute function public.register_series_fandoms();

-- Expiry runs independently of successful retrieval. An indexed owner check at
-- the existing revision boundary also prevents reuse of expired result caches.
create function public.expire_fandom_classifications(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare keys text[];
begin
 with expired as (update public.fandom_classifications set status='unknown',dirty=true,next_attempt_at=now(),lease_token=null,leased_until=null
  where user_id=p_user and (status='crossover' and valid_until<=now() or dirty and status<>'unknown') returning key)
 select array_agg(key) into keys from expired;
 if keys is null then return; end if;
 update public.library_search_documents set story=story where user_id=p_user and crossover_key=any(keys);
 -- Unsaved series members also invalidate the owner's cached pool.
 perform public.invalidate_library_queries(p_user);
end $$;
create or replace function public.library_revision() returns bigint
language plpgsql volatile security definer set search_path='' as $$
begin
 perform public.expire_fandom_classifications((select auth.uid()));
 return coalesce((select revision from public.library_query_state where user_id=(select auth.uid())),0);
end $$;

create function public.claim_fandom_classifications(p_user uuid,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); sets jsonb; pending text[]; seen text[]:='{}'; n text; p public.ao3_fandom_profiles; version bigint;
begin
 perform public.expire_fandom_classifications(p_user);
 delete from public.fandom_classifications c where user_id=p_user
  and not exists(select 1 from public.library_search_documents d where d.user_id=p_user and d.crossover_key=c.key)
  and not exists(select 1 from public.library_series r cross join lateral jsonb_array_elements(coalesce(r.metadata->'works','[]')) w
   where r.user_id=p_user and public.library_fandom_key(w->'fandoms',false)=c.key);
 with candidates as (select key from public.fandom_classifications where user_id=p_user and dirty and next_attempt_at<=now()
  and coalesce(leased_until,'epoch')<=now() order by next_attempt_at,key limit least(greatest(p_limit,1),20) for update skip locked),
 claimed as (update public.fandom_classifications c set lease_token=token,leased_until=now()+interval '2 minutes' from candidates a
  where c.user_id=p_user and c.key=a.key returning c.*)
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'fandoms',fandoms,'verifiedEmpty',verified_empty)),'[]') into sets from claimed;
 pending:=array(select distinct jsonb_array_elements_text(s->'fandoms') from jsonb_array_elements(sets) s);
 -- Traverse once per bounded batch, not once per query or saved work. Missing
 -- endpoints remain candidates and cannot establish a complete closure.
 while cardinality(pending)>0 and cardinality(seen)<4096 loop
  n:=pending[1]; pending:=pending[2:];
  if n=any(seen) then continue; end if;
  seen:=array_append(seen,n);
  pending:=pending||array(select root.source_key from public.external_fandom_mappings observed
   join public.external_fandom_mappings root on root.canonical_fandom_id=observed.canonical_fandom_id and root.source_site='ao3' and root.source_category='fandom' and root.identity_scheme='ao3_tag_profile_v1' and root.mapping_state='verified'
   join public.ao3_fandom_profiles profile on profile.name=root.source_key and profile.status='canonical' and not profile.disputed
   where observed.source_site='ao3' and observed.source_category='fandom' and observed.identity_scheme='ao3_tag_profile_v1' and observed.source_key=n and observed.mapping_state='verified');
  select * into p from public.ao3_fandom_profiles where name=n;
  if found and not p.disputed then
   pending:=pending||p.metatag_names;
   if p.canonical_name is not null and p.canonical_name<>n then pending:=array_append(pending,p.canonical_name); end if;
  end if;
  pending:=pending[1:4096];
 end loop;
 insert into public.fandom_resolution_requests(user_id,name) select p_user,v from unnest(seen) v on conflict do nothing;
 delete from public.fandom_resolution_requests r where user_id=p_user and not exists(
  select 1 from public.fandom_classifications c where c.user_id=p_user and (c.fandoms @> array[r.name] or c.dependency_names @> array[r.name])) and not r.name=any(seen);
 select revision into version from public.fandom_evidence_state;
 return jsonb_build_object('revision',version,'token',token,'sets',sets,'names',seen,
  'profiles',coalesce((select jsonb_agg(jsonb_build_object('name',ep.name,'canonical_name',ep.canonical_name,'status',ep.status,'disputed',ep.disputed,
   'metatag_names',ep.metatag_names,'hierarchy_complete',ep.hierarchy_complete,'parser_version',ep.parser_version,'last_complete_at',ep.last_complete_at))
   from public.ao3_fandom_profiles ep where name=any(seen)),'[]'),
  'mappings',coalesce((select jsonb_agg(to_jsonb(m)) from public.external_fandom_mappings m where source_site='ao3' and source_category='fandom' and identity_scheme='ao3_tag_profile_v1' and source_key=any(seen)),'[]'));
end $$;
create function public.commit_fandom_classifications(p_user uuid,p_token uuid,p_revision bigint,p_results jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare r jsonb; keys text[]:='{}'; n integer;
begin
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>20 then raise exception 'Invalid crossover batch'; end if;
 -- Share-lock the evidence revision until projections/memberships publish.
 if (select revision from public.fandom_evidence_state for share)<>p_revision then
  update public.fandom_classifications set leased_until=null,lease_token=null where user_id=p_user and lease_token=p_token; return 0;
 end if;
 for r in select value from jsonb_array_elements(p_results) loop
  if r->>'policy' is distinct from 'ao3_hierarchy_v1' or r->>'classifierVersion' is distinct from '1'
   or r->>'status' not in ('crossover','not_crossover','unknown')
   or (r->>'status'='crossover' and (nullif(r->>'validUntil','') is null or (r->>'validUntil')::timestamptz<=now() or (r->>'validUntil')::timestamptz>now()+interval '30 days'))
  then raise exception 'Invalid crossover classification'; end if;
  update public.fandom_classifications set status=r->>'status',evidence_revision=p_revision,valid_until=nullif(r->>'validUntil','')::timestamptz,
   dependency_names=array(select value from jsonb_array_elements_text(r->'dependencyNames')),dirty=false,lease_token=null,leased_until=null
   where user_id=p_user and key=r->>'key' and lease_token=p_token and leased_until>now();
  get diagnostics n=row_count;
  if n>0 then keys:=array_append(keys,r->>'key'); end if;
 end loop;
 if cardinality(keys)>0 then
  update public.library_search_documents set story=story where user_id=p_user and crossover_key=any(keys);
  perform public.invalidate_library_queries(p_user);
 end if;
 return cardinality(keys);
end $$;

create function public.claim_fandom_resolution(p_user uuid) returns text
language plpgsql security definer set search_path='' as $$
declare n text;
begin
 -- Successful public cache entries need no network request for each owner.
 update public.fandom_resolution_requests r set next_attempt_at=greatest(p.checked_at+interval '30 days',now()+interval '10 minutes')
 from public.ao3_fandom_profiles p where r.user_id=p_user and p.name=r.name and not p.disputed
  and p.status in ('canonical','synonym','custom') and p.checked_at>now()-interval '30 days'
  and (p.status<>'canonical' or p.parser_version='ao3_fandom_profile_v2' and p.hierarchy_complete);
 update public.fandom_resolution_requests r set next_attempt_at=greatest(p.checked_at+interval '30 days',now()+interval '10 minutes')
 from public.external_fandom_mappings m join public.external_fandom_mappings root on root.canonical_fandom_id=m.canonical_fandom_id
  and root.source_site='ao3' and root.source_category='fandom' and root.identity_scheme='ao3_tag_profile_v1' and root.mapping_state='verified'
 join public.ao3_fandom_profiles p on p.name=root.source_key and p.status='canonical' and not p.disputed and p.hierarchy_complete and p.parser_version='ao3_fandom_profile_v2'
 where r.user_id=p_user and m.source_site='ao3' and m.source_category='fandom' and m.identity_scheme='ao3_tag_profile_v1'
  and m.source_key=r.name and m.mapping_state='verified' and m.verified_at>now()-interval '30 days' and p.checked_at>now()-interval '30 days';
 select name into n from public.fandom_resolution_requests where user_id=p_user and next_attempt_at<=now()
  and coalesce(leased_until,'epoch')<=now() order by next_attempt_at,name limit 1 for update skip locked;
 if n is null then return null; end if;
 update public.fandom_resolution_requests set leased_until=now()+interval '2 minutes' where user_id=p_user and name=n;
 return n;
end $$;
create function public.finish_fandom_resolution(p_user uuid,p_name text,p_delay integer default 600) returns void
language sql security definer set search_path='' as $$
 insert into public.fandom_resolution_requests(user_id,name,next_attempt_at)
 values(p_user,p_name,now()+make_interval(secs=>least(greatest(p_delay,35),2592000)))
 on conflict(user_id,name) do update set leased_until=null,next_attempt_at=excluded.next_attempt_at;
$$;
create function public.pending_fandom_owners(p_limit integer default 20) returns setof uuid
language sql stable security definer set search_path='' as $$
 select user_id from (
  select user_id,next_attempt_at due from public.fandom_classifications where dirty and next_attempt_at<=now() and coalesce(leased_until,'epoch')<=now()
  union all select user_id,valid_until from public.fandom_classifications where status='crossover' and valid_until<=now()
  union all select user_id,next_attempt_at from public.fandom_resolution_requests where next_attempt_at<=now() and coalesce(leased_until,'epoch')<=now()
 ) pending group by user_id order by min(due),user_id limit least(greatest(p_limit,1),20);
$$;
revoke all on function public.pending_fandom_owners(integer) from public,anon,authenticated;
grant execute on function public.pending_fandom_owners(integer) to service_role;

-- Existing shared filtering, including any-member series semantics.
create function public.library_crossover_matches(s jsonb,p_mode text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(p_mode,'allowed') not in ('only','exclude') or exists(select 1 from jsonb_array_elements_text(
  coalesce(s->'crossoverStatuses',jsonb_build_array(case when s->>'crossoverPolicy'='ao3_hierarchy_v1' and s->>'crossoverClassifierVersion'='1'
   then public.fandom_classification_document(s->>'crossoverStatus',0,nullif(s->>'crossoverValidUntil','')::timestamptz)->>'crossoverStatus' else 'unknown' end))) v
  where case when p_mode='only' then v='crossover' else v<>'crossover' end);
$$;
do $$ declare d text; u text; signature text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into d;
 u:=replace(d,$old$(coalesce(f->>'crossovers','allowed')='allowed' or coalesce(s->'crossovers',jsonb_build_array(public.library_crossover(s->'metadata'))) @> jsonb_build_array(f->>'crossovers'='only'))$old$,
 $new$public.library_crossover_matches(s,f->>'crossovers')$new$);
 if u=d then raise exception 'Review crossover filter'; end if; execute u;
 select pg_get_functiondef('public.library_query_work_sql(jsonb,boolean,boolean)'::regprocedure) into d;
 u:=replace(d,E'begin\n',E'begin\n filters:=filters-''crossovers'';\n');
 u:=replace(u,$old$end||filter_clause||$sql$), selected as ($old$,
 $new$end||case p_query->'filters'->>'crossovers' when 'only' then ' and d.crossover_status=''crossover''' when 'exclude' then ' and d.crossover_status is distinct from ''crossover''' else '' end||filter_clause||$sql$), selected as ($new$);
 if u=d or position('d.crossover_status' in u)=0 then raise exception 'Review indexed crossover selection'; end if; execute u;
 select pg_get_functiondef('public.library_series_results(jsonb,boolean,boolean,boolean)'::regprocedure) into d;
 u:=replace(d,$old$'crossovers',(select coalesce(jsonb_agg(distinct public.library_crossover(jsonb_build_object('fandoms',coalesce(w->'fandoms','[]')))),'[]') from jsonb_array_elements(works) w)$old$,
 $new$'crossoverStatuses',(select coalesce(jsonb_agg(distinct public.library_cached_crossover(w->'fandoms')->>'crossoverStatus'),'[]') from jsonb_array_elements(works) w)$new$);
 -- Include the same cached member projection in returned preview works.
 u:=replace(u,$old$else (select coalesce(jsonb_agg(w order by$old$,$new$else (select coalesce(jsonb_agg(w||public.library_cached_crossover(w->'fandoms') order by$new$);
 if u=d then raise exception 'Review series crossover projection'; end if; execute u;
 foreach signature in array array['public.library_catalog_story(jsonb)','public.library_series_input(jsonb)','public.library_facet_document(jsonb)'] loop
  select pg_get_functiondef(signature::regprocedure) into d;
  u:=replace(d,$old$'id',s->'id',$old$,$new$'crossoverStatus',s->'crossoverStatus','crossoverPolicy',s->'crossoverPolicy','crossoverClassifierVersion',s->'crossoverClassifierVersion','crossoverEvidenceRevision',s->'crossoverEvidenceRevision','crossoverValidUntil',s->'crossoverValidUntil','id',s->'id',$new$);
  if u=d then raise exception 'Review compact crossover projection %',signature; end if; execute u;
 end loop;
end $$;
drop function public.library_crossover(jsonb);

revoke all on function public.library_fandom_names(jsonb),public.library_fandom_key(jsonb,boolean),public.fandom_classification_document(text,bigint,timestamptz),public.library_cached_crossover(jsonb,boolean),public.library_crossover_matches(jsonb,text) from public,anon;
grant execute on function public.library_fandom_names(jsonb),public.library_fandom_key(jsonb,boolean),public.fandom_classification_document(text,bigint,timestamptz),public.library_cached_crossover(jsonb,boolean),public.library_crossover_matches(jsonb,text) to authenticated,service_role;
revoke all on function public.ensure_fandom_classification(uuid,jsonb,boolean),public.fandom_evidence_changed(),public.register_series_fandoms(),public.expire_fandom_classifications(uuid),public.claim_fandom_classifications(uuid,integer),public.commit_fandom_classifications(uuid,uuid,bigint,jsonb),public.claim_fandom_resolution(uuid),public.finish_fandom_resolution(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_fandom_classifications(uuid,integer),public.commit_fandom_classifications(uuid,uuid,bigint,jsonb),public.claim_fandom_resolution(uuid),public.finish_fandom_resolution(uuid,text,integer),public.expire_fandom_classifications(uuid) to service_role;

-- Additive conservative backfill: register effective observations, publish
-- unknown pending pure-classifier processing, and refresh maintained membership.
update public.library_search_documents set story=story;
do $$ declare r record; w jsonb; begin
 for r in select user_id,metadata from public.library_series loop
  for w in select value from jsonb_array_elements(coalesce(r.metadata->'works','[]')) loop perform public.ensure_fandom_classification(r.user_id,w->'fandoms',false); end loop;
 end loop;
end $$;
delete from public.library_query_cache;
update public.library_query_state set revision=revision+1;
notify pgrst,'reload schema';
commit;
