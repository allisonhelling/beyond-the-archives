-- Phase 1 only. Shared AO3 metadata is writable solely by trusted server code.
-- Personal records are owned by auth.users and never embedded in shared metadata.
begin;

create type public.reading_status as enum (
  'to_read', 'reading', 'waiting_for_updates', 're_reading', 'finished', 'did_not_finish'
);
create type public.metadata_source as enum ('unknown', 'ao3', 'manual', 'extension');
create type public.ao3_tag_category as enum ('relationship', 'character', 'freeform', 'warning', 'category');

create table public.works (
  id uuid primary key default gen_random_uuid(),
  ao3_work_id bigint not null unique check (ao3_work_id > 0),
  canonical_url text,
  canonical_verified_at timestamptz,
  title text,
  summary text,
  rating text check (rating in ('General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated')),
  language text,
  word_count integer check (word_count >= 0),
  published_chapters integer check (published_chapters >= 0),
  total_chapters integer check (total_chapters > 0),
  is_complete boolean, -- NULL is unknown, false means confirmed in progress.
  ao3_published_at timestamptz,
  ao3_updated_at timestamptz,
  last_metadata_check timestamptz,
  metadata_source public.metadata_source not null default 'unknown',
  field_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(field_provenance) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_canonical_url check (
    (canonical_url is null and canonical_verified_at is null) or
    (canonical_url is not null and canonical_url = 'https://archiveofourown.org/works/' || ao3_work_id::text and canonical_verified_at is not null)
  ),
  constraint valid_chapter_counts check (total_chapters is null or published_chapters is null or published_chapters <= total_chapters)
);

create table public.library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete restrict,
  original_url text not null check (length(trim(original_url)) > 0),
  reading_status public.reading_status not null default 'to_read',
  last_read_chapter integer not null default 0 check (last_read_chapter >= 0),
  personal_rating smallint check (personal_rating between 1 and 5),
  notes text not null default '',
  is_favorite boolean not null default false,
  -- Overrides are private and independent of future automatically retrieved metadata.
  metadata_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_overrides) = 'object'),
  started_at timestamptz,
  finished_at timestamptz,
  last_update_notification_at timestamptz,
  update_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_id),
  unique (id, user_id),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  ao3_username text unique,
  name text not null check (length(trim(name)) > 0),
  ao3_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.work_authors (
  work_id uuid not null references public.works(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  primary key (work_id, author_id)
);
create table public.fandoms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.work_fandoms (
  work_id uuid not null references public.works(id) on delete cascade,
  fandom_id uuid not null references public.fandoms(id) on delete cascade,
  primary key (work_id, fandom_id)
);
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category public.ao3_tag_category not null default 'freeform',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, category)
);
create table public.work_tags (
  work_id uuid not null references public.works(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (work_id, tag_id)
);
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  default_key text check (default_key in ('currently_reading', 'to_read', 'favorites', 'finished', 'did_not_finish')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name),
  unique (user_id, default_key)
);
create table public.collection_works (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id uuid not null,
  library_entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (collection_id, library_entry_id),
  foreign key (collection_id, user_id) references public.collections(id, user_id) on delete cascade,
  foreign key (library_entry_id, user_id) references public.library_entries(id, user_id) on delete cascade
);
create table public.personal_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);
create table public.library_entry_tags (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  library_entry_id uuid not null,
  personal_tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (library_entry_id, personal_tag_id),
  foreign key (library_entry_id, user_id) references public.library_entries(id, user_id) on delete cascade,
  foreign key (personal_tag_id, user_id) references public.personal_tags(id, user_id) on delete cascade
);

-- Index policy predicates and both directions of normalized relationships.
create index library_entries_work_id_idx on public.library_entries(work_id);
create index library_entries_user_status_idx on public.library_entries(user_id, reading_status);
create index work_authors_author_idx on public.work_authors(author_id);
create index work_fandoms_fandom_idx on public.work_fandoms(fandom_id);
create index work_tags_tag_idx on public.work_tags(tag_id);
create index collection_works_user_idx on public.collection_works(user_id);
create index collection_works_entry_idx on public.collection_works(library_entry_id, user_id);
create index library_entry_tags_user_idx on public.library_entry_tags(user_id);
create index library_entry_tags_tag_idx on public.library_entry_tags(personal_tag_id, user_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['works', 'library_entries', 'authors', 'fandoms', 'tags', 'collections', 'personal_tags'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
  foreach table_name in array array[
    'works','library_entries','authors','work_authors','fandoms','work_fandoms',
    'tags','work_tags','collections','collection_works','personal_tags','library_entry_tags'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
  foreach table_name in array array['library_entries','collections','collection_works','personal_tags','library_entry_tags'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name);
  end loop;
  foreach table_name in array array['works','authors','work_authors','fandoms','work_fandoms','tags','work_tags'] loop
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Invoker policies: no SECURITY DEFINER lookup function can leak library membership.
create policy saved_work_read on public.works for select to authenticated
using (exists (select 1 from public.library_entries e where e.work_id = works.id and e.user_id = (select auth.uid())));
create policy saved_work_authors_read on public.work_authors for select to authenticated
using (exists (select 1 from public.works w where w.id = work_authors.work_id));
create policy saved_work_fandoms_read on public.work_fandoms for select to authenticated
using (exists (select 1 from public.works w where w.id = work_fandoms.work_id));
create policy saved_work_tags_read on public.work_tags for select to authenticated
using (exists (select 1 from public.works w where w.id = work_tags.work_id));
create policy saved_authors_read on public.authors for select to authenticated
using (exists (select 1 from public.work_authors wa where wa.author_id = authors.id));
create policy saved_fandoms_read on public.fandoms for select to authenticated
using (exists (select 1 from public.work_fandoms wf where wf.fandom_id = fandoms.id));
create policy saved_tags_read on public.tags for select to authenticated
using (exists (select 1 from public.work_tags wt where wt.tag_id = tags.id));

-- A browser cannot attach a guessed shared work ID and thereby reveal its metadata.
-- Existing entries can update personal fields, but identity and original submission stay fixed.
revoke insert on public.library_entries from authenticated;
revoke update on public.library_entries from authenticated;
grant update (reading_status, last_read_chapter, personal_rating, notes, is_favorite,
  metadata_overrides, started_at, finished_at, update_dismissed_at) on public.library_entries to authenticated;

commit;
