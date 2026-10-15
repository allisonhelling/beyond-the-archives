-- Phase 2: private manual metadata and an atomic, authenticated save boundary.
begin;

-- Only trusted metadata writers can populate this map: chapter position -> AO3 chapter ID.
alter table public.works add column verified_chapters jsonb not null default '{}'::jsonb
  check (jsonb_typeof(verified_chapters) = 'object');

create function public.validate_manual_entry() returns trigger
language plpgsql set search_path = '' as $$
declare m jsonb := new.metadata_overrides; k text; published integer; total integer;
begin
  foreach k in array array['title','summary','rating','publication_status'] loop
    if m ? k and jsonb_typeof(m->k) <> 'string' then
      raise exception 'Expected text metadata' using errcode = '22023';
    end if;
  end loop;
  foreach k in array array['published_chapters','total_chapters','word_count'] loop
    if m ? k and m->k <> 'null'::jsonb then
      if jsonb_typeof(m->k) <> 'number' or (m->>k) !~ '^[0-9]+$' then
        raise exception 'Invalid chapter or word count' using errcode = '22023';
      end if;
      if (m->>k)::numeric > 2147483647 then raise exception 'Count too large' using errcode = '22023'; end if;
    end if;
  end loop;
  published := (m->>'published_chapters')::integer;
  total := (m->>'total_chapters')::integer;
  if total = 0 or published > total or new.last_read_chapter > published or new.last_read_chapter > total then
    raise exception 'Progress or published chapters exceed chapter count' using errcode = '22023';
  end if;
  foreach k in array array['authors','fandoms','ao3_tags'] loop
    if m ? k then
      if jsonb_typeof(m->k) <> 'array' then raise exception 'Expected metadata list' using errcode = '22023'; end if;
      if exists(select 1 from jsonb_array_elements(m->k) v where jsonb_typeof(v) <> 'string') then
        raise exception 'Expected text metadata' using errcode = '22023';
      end if;
    end if;
  end loop;
  if m ? 'publication_status' and m->>'publication_status' not in ('unknown','in_progress','complete') then
    raise exception 'Invalid publication status' using errcode = '22023';
  end if;
  if m->>'rating' is not null and m->>'rating' not in ('','General Audiences','Teen And Up Audiences','Mature','Explicit','Not Rated') then
    raise exception 'Invalid AO3 rating' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_manual_entry() from public, anon, authenticated;
create trigger validate_manual_entry before insert or update on public.library_entries
for each row execute function public.validate_manual_entry();

create function public.save_library_story(
  p_url text, p_metadata jsonb, p_status public.reading_status, p_progress integer,
  p_notes text, p_rating smallint, p_favorite boolean,
  p_collections uuid[], p_tags text[], p_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); work_key bigint; work_uuid uuid; entry_uuid uuid; tag_name text; tag_uuid uuid;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Strict work URL allowlist. A chapter identifier is never interpreted as its position.
  if trim(p_url) !~ '^https?://(www\.)?archiveofourown\.org/works/[1-9][0-9]*(/chapters/[1-9][0-9]*)?/?([?#][^[:space:]]*)?$' then
    raise exception 'Enter a supported AO3 work URL' using errcode = '22023';
  end if;
  work_key := substring(trim(p_url) from '/works/([1-9][0-9]*)')::bigint;
  if work_key > 9007199254740991 then raise exception 'AO3 work ID too large' using errcode = '22023'; end if;
  if jsonb_typeof(p_metadata) <> 'object' or coalesce(length(trim(p_metadata->>'title')),0) = 0 then
    raise exception 'Title is required' using errcode = '22023';
  end if;
  if p_status is null or p_progress is null or p_progress < 0 or p_favorite is null then
    raise exception 'Invalid reading information' using errcode = '22023';
  end if;
  if p_id is null then
    -- Never change shared metadata from a private manual submission.
    insert into public.works(ao3_work_id) values(work_key) on conflict (ao3_work_id) do nothing;
    select id into work_uuid from public.works where ao3_work_id = work_key;
    insert into public.library_entries(user_id,work_id,original_url,metadata_overrides,reading_status,last_read_chapter,notes,personal_rating,is_favorite)
      values(owner_id,work_uuid,p_url,p_metadata,p_status,p_progress,coalesce(p_notes,''),p_rating,p_favorite) returning id into entry_uuid;
  else
    select e.id into entry_uuid from public.library_entries e join public.works w on w.id=e.work_id
      where e.id=p_id and e.user_id=owner_id and w.ao3_work_id=work_key for update of e;
    if entry_uuid is null then raise exception 'Story unavailable or work identity changed' using errcode = '42501'; end if;
    update public.library_entries set metadata_overrides=metadata_overrides || p_metadata,reading_status=p_status,
      last_read_chapter=p_progress,notes=coalesce(p_notes,''),personal_rating=p_rating,is_favorite=p_favorite where id=entry_uuid;
  end if;
  if exists(select 1 from unnest(p_collections) c where not exists (
    select 1 from public.collections where id=c and user_id=owner_id and default_key is null)) then
    raise exception 'Collection unavailable' using errcode = '42501';
  end if;
  delete from public.collection_works where library_entry_id=entry_uuid and user_id=owner_id;
  insert into public.collection_works(user_id,collection_id,library_entry_id)
    select owner_id,c,entry_uuid from (select distinct unnest(p_collections) c) chosen;
  delete from public.library_entry_tags where library_entry_id=entry_uuid and user_id=owner_id;
  foreach tag_name in array coalesce(p_tags,array[]::text[]) loop
    tag_name := trim(tag_name);
    if tag_name = '' then continue; end if;
    insert into public.personal_tags(user_id,name) values(owner_id,tag_name)
      on conflict (user_id,name) do update set name=excluded.name returning id into tag_uuid;
    insert into public.library_entry_tags(user_id,library_entry_id,personal_tag_id) values(owner_id,entry_uuid,tag_uuid) on conflict do nothing;
  end loop;
  return entry_uuid;
end;
$$;
revoke all on function public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid) from public, anon;
grant execute on function public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid) to authenticated;
commit;
