begin;

-- Public AO3 evidence, cached separately for each reader. Browser clients can
-- read their cache but only the authenticated server resolver can verify tags.
create table public.ao3_tag_resolutions (
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('character','relationship','freeform')),
 name text not null check(length(name) between 1 and 10000),
 status text not null check(status in ('canonical','synonym','custom','unverified')),
 canonical_name text check(canonical_name is null or length(canonical_name) between 1 and 10000),
 checked_at timestamptz not null default now(), attempted_at timestamptz not null default now(),
 primary key(user_id,category,name),
 check((status='canonical' and canonical_name=name) or (status='synonym' and canonical_name is not null and canonical_name<>name) or (status in ('custom','unverified') and canonical_name is null))
);
alter table public.ao3_tag_resolutions enable row level security;
alter table public.ao3_tag_resolutions force row level security;
create policy own_tag_resolutions on public.ao3_tag_resolutions for select to authenticated using(user_id=(select auth.uid()));
grant select on public.ao3_tag_resolutions to authenticated;
grant all on public.ao3_tag_resolutions to service_role;
create index tag_resolution_alias_idx on public.ao3_tag_resolutions(user_id,category,canonical_name) where status in ('canonical','synonym');

create function public.store_tag_resolutions(p_user uuid,p_records jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>1000 then raise exception 'Invalid tag resolutions'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  -- A canonical which has been re-wrangled no longer validates its old aliases.
  update public.ao3_tag_resolutions set status='unverified',canonical_name=null,attempted_at='epoch'
   where user_id=p_user and category=r->>'category' and canonical_name=r->>'name' and name<>r->>'name'
    and r->>'status' in ('synonym','custom');
  insert into public.ao3_tag_resolutions(user_id,category,name,status,canonical_name)
   values(p_user,r->>'category',r->>'name',r->>'status',r->>'canonical_name')
   on conflict(user_id,category,name) do update set
    status=case when excluded.status='unverified' then ao3_tag_resolutions.status else excluded.status end,
    canonical_name=case when excluded.status='unverified' then ao3_tag_resolutions.canonical_name else excluded.canonical_name end,
    checked_at=case when excluded.status='unverified' then ao3_tag_resolutions.checked_at else now() end,attempted_at=now();
 end loop;
end $$;

-- Low-priority lookups reuse the existing global request/pause gate and yield
-- to pending metadata imports rather than consuming their retrieval capacity.
create function public.reserve_tag_resolution() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.metadata_jobs where retrieval_mode='direct' and status in ('pending','processing')) then return false; end if;
 return public.reserve_series_preview();
end $$;

create function public.library_tag_aliases(p_owner uuid) returns jsonb
language sql stable set search_path='' as $$
 with aliases as (
  select r.category,public.library_normalize(c.name) canonical,public.library_normalize(r.name) name
  from public.ao3_tag_resolutions r join public.ao3_tag_resolutions c
   on c.user_id=r.user_id and c.category=r.category and c.name=r.canonical_name and c.status='canonical'
  where r.user_id=p_owner and r.status in ('canonical','synonym')
 ), names as (
  select category,canonical,jsonb_object_agg(name,true) names from aliases group by category,canonical
 ), categories as (
  select category,jsonb_object_agg(canonical,names) names from names group by category
 ) select coalesce(jsonb_object_agg(category,names),'{}') from categories;
$$;
create function public.library_alias_filters(f jsonb,p_owner uuid) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if f ? 'tagAliases' or coalesce(f->>'relationship','')='' and coalesce(f->>'characters','')='' and coalesce(f->>'tags','')='' then return f; end if;
 return f||jsonb_build_object('tagAliases',public.library_tag_aliases(p_owner));
end $$;
create function public.library_alias_rules(r jsonb,p_owner uuid) returns jsonb
language sql stable strict set search_path='' as $$
 select r||jsonb_build_object('filters',public.library_alias_filters(coalesce(r->'filters','{}'),p_owner));
$$;

-- Canonical selections use exact verified names; partial/unverified terms keep
-- the established substring search. No name similarity or related-tag guesses.
create function public.library_tag_matches(p_tag text,p_category text,p_term text,p_aliases jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare category text:=case p_category when 'relationship_tags' then 'relationship' when 'character_tags' then 'character' else 'freeform' end;
 names jsonb;
begin
 names:=p_aliases->category->p_term;
 if names is not null then return names ? public.library_normalize(p_tag); end if;
 return strpos(public.library_normalize(p_tag),p_term)>0;
end $$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition,
  'jsonb_array_elements_text(coalesce(s->''metadata''->field.key,''[]'')) tag where strpos(public.library_normalize(tag),trim(term))>0',
  'jsonb_array_elements_text(coalesce(s->''metadata''->field.key,''[]'')) tag where public.library_tag_matches(tag,field.key,trim(term),f->''tagAliases'')');
 if updated=definition then raise exception 'Review shared tag matching'; end if;
 execute updated;

 -- Resolve the index once per page query, outside the per-work matcher.
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,' with pool as materialized', $new$
 p_query:=jsonb_set(p_query,'{filters}',public.library_alias_filters(coalesce(p_query->'filters','{}')-'tagAliases',(select auth.uid())));
 with pool as materialized$new$);
 if updated=definition then raise exception 'Review page alias index'; end if;
 execute updated;

 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,' return query', $new$
 collection_rules:=public.library_alias_rules(collection_rules,(select auth.uid()));
 return query$new$);
 if updated=definition then raise exception 'Review collection alias index'; end if;
 execute updated;

 select pg_get_functiondef('public.library_navigation()'::regprocedure) into definition;
 updated:=replace(definition,'shelves as (','shelves as materialized (');
 updated:=replace(updated,'select id::text,automatic_rules from public.collections',
  'select id::text,public.library_alias_rules(automatic_rules,(select auth.uid())) from public.collections');
 if updated=definition then raise exception 'Review navigation alias index'; end if;
 execute updated;

 select pg_get_functiondef('public.automatic_collection_matches(jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,E'begin\n',E'begin\n p_rules:=public.library_alias_rules(p_rules,(select auth.uid()));\n');
 if updated=definition then raise exception 'Review automatic alias matching'; end if;
 execute updated;
 select pg_get_functiondef('public.automatic_collection_ids(jsonb,uuid)'::regprocedure) into definition;
 updated:=replace(definition,'public.automatic_collection_matches(s,c.automatic_rules)',
  'public.automatic_collection_matches(s,public.library_alias_rules(c.automatic_rules,p_owner))');
 if updated=definition then raise exception 'Review automatic alias owner'; end if;
 execute updated;
end $$;

revoke all on function public.store_tag_resolutions(uuid,jsonb),public.reserve_tag_resolution() from public,anon,authenticated;
grant execute on function public.store_tag_resolutions(uuid,jsonb),public.reserve_tag_resolution() to service_role;
revoke all on function public.library_tag_aliases(uuid),public.library_alias_filters(jsonb,uuid),public.library_alias_rules(jsonb,uuid),public.library_tag_matches(text,text,text,jsonb) from public,anon;
grant execute on function public.library_tag_aliases(uuid),public.library_alias_filters(jsonb,uuid),public.library_alias_rules(jsonb,uuid),public.library_tag_matches(text,text,text,jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
