begin;

create table public.site_mappings (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 version integer not null check (version > 0),
 rule jsonb not null check (jsonb_typeof(rule) = 'object' and octet_length(rule::text) <= 48000),
 primary key (user_id, id),
 check (rule - array['id','version','scope','example','prefix','field','selectors','strip','previous','validation'] = '{}'::jsonb),
 check (rule->>'id' is not distinct from id::text and rule->>'version' is not distinct from version::text)
);

alter table public.site_mappings enable row level security;
alter table public.site_mappings force row level security;
revoke all on public.site_mappings from public, anon, authenticated;
grant select on public.site_mappings to authenticated;
create policy site_mappings_owner on public.site_mappings for select to authenticated using (user_id = (select auth.uid()));

-- Every edit uses an expected version. Imports use fresh IDs and commit atomically.
create function public.write_site_mapping(p_rule jsonb default null, p_id uuid default null, p_version integer default 0, p_import jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null or p_version is null or p_version < 0 then return false; end if;
 if p_import is not null then
  if jsonb_typeof(p_import)<>'array' or jsonb_array_length(p_import) not between 1 and 100 or octet_length(p_import::text)>250000 then
   raise exception 'Invalid mapping import' using errcode='22023';
  end if;
  insert into public.site_mappings(user_id,id,version,rule)
   select owner_id,(item->>'id')::uuid,1,item from jsonb_array_elements(p_import) item;
 elsif p_rule is null then
  delete from public.site_mappings where user_id=owner_id and id=p_id and version=p_version;
 elsif p_version = 0 then
  insert into public.site_mappings(user_id,id,version,rule) values(owner_id,p_id,1,p_rule) on conflict do nothing;
 else
  update public.site_mappings set version=p_version+1,rule=p_rule
  where user_id=owner_id and id=p_id and version=p_version;
 end if;
 return found;
end;
$$;

revoke all on function public.write_site_mapping(jsonb,uuid,integer,jsonb) from public,anon;
grant execute on function public.write_site_mapping(jsonb,uuid,integer,jsonb) to authenticated;

-- Record bounded browser observations independently of the reviewed overrides.
-- Delegate identity, progress review, concurrency and all story writes to the existing checked editor.
create function public.save_companion_story(p_id uuid, p_url text, p_input jsonb, p_base jsonb, p_observations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); entry_id uuid; item record;
begin
 if owner_id is null or not public.valid_story_submission(p_url) or jsonb_typeof(p_observations) is distinct from 'object'
  or octet_length(p_observations::text)>34000 then
  raise exception 'Invalid companion story data' using errcode='22023';
 end if;
 for item in select key,value from jsonb_each(p_observations) loop
  if item.key not in ('title','authors','fandoms','summary','ao3_tags','categories','published_chapters','total_chapters','publication_status')
   or jsonb_typeof(item.value) is distinct from 'object' or item.value-'text'-'via'<>'{}'::jsonb
   or jsonb_typeof(item.value->'text') is distinct from 'string'
   or char_length(item.value->>'text')>(case when item.key='summary' then 4000 else 500 end)
   or coalesce(item.value->>'via','') not in ('Site Adapter','Structured Data','Page Metadata','Page Element','Saved Mapping','Mapped Element') then
   raise exception 'Invalid source observation' using errcode='22023';
  end if;
 end loop;
 if p_id is not null and not exists(select 1 from public.library_entries where id=p_id and user_id=owner_id and source_url=p_url) then
  raise exception 'The source story is unavailable' using errcode='42501';
 end if;
 entry_id:=public.save_library_story_checked(p_id,p_url,p_input,p_base);
 if p_observations <> '{}'::jsonb then
  update public.library_entries set extension_metadata=extension_metadata||jsonb_build_object('generic_observations',p_observations,'generic_observed_at',statement_timestamp())
  where id=entry_id and user_id=owner_id and source_url=p_url;
  if not found then raise exception 'The source story is unavailable' using errcode='42501'; end if;
 end if;
 return entry_id;
end;
$$;
revoke all on function public.save_companion_story(uuid,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_companion_story(uuid,text,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
