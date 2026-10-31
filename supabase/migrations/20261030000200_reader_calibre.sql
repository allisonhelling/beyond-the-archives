-- Calibre credentials only permit delivery to one reader account/device.
create table public.reader_transfer_destinations (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 device text not null check (length(device) between 1 and 100),
 label text not null check (length(label) between 1 and 160),
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.reader_import_inbox (
 destination uuid not null references public.reader_transfer_destinations(id) on delete cascade,
 id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 hash text not null check (hash ~ '^[0-9a-f]{64}$'),
 metadata jsonb not null default '{}' check (octet_length(metadata::text) <= 16384),
 status text not null default 'queued' check (status in ('queued','imported','duplicate','error','cancelled')),
 message text not null default '' check (length(message) <= 2000),
 created_at timestamptz not null default now(),
 primary key (destination,id)
);
create index reader_import_pending on public.reader_import_inbox(user_id,created_at) where status='queued';
alter table public.reader_transfer_destinations enable row level security;
alter table public.reader_transfer_destinations force row level security;
alter table public.reader_import_inbox enable row level security;
alter table public.reader_import_inbox force row level security;
revoke all on public.reader_transfer_destinations,public.reader_import_inbox from public,anon,authenticated;
create policy transfer_destination_read on public.reader_transfer_destinations for select to authenticated using (user_id=(select auth.uid()) and public.reader_has_access());
create policy transfer_destination_create on public.reader_transfer_destinations for insert to authenticated with check (user_id=(select auth.uid()) and public.reader_has_access() and not revoked);
create policy transfer_destination_revoke on public.reader_transfer_destinations for update to authenticated using (user_id=(select auth.uid()) and public.reader_has_access()) with check (user_id=(select auth.uid()) and revoked);
grant select,insert on public.reader_transfer_destinations to authenticated;
grant update(revoked) on public.reader_transfer_destinations to authenticated;
create policy reader_inbox_read on public.reader_import_inbox for select to authenticated using (user_id=(select auth.uid()) and public.reader_has_access());
create policy reader_inbox_result on public.reader_import_inbox for update to authenticated using (user_id=(select auth.uid()) and public.reader_has_access()) with check (user_id=(select auth.uid()) and public.reader_has_access());
grant select on public.reader_import_inbox to authenticated;
grant update(status,message) on public.reader_import_inbox to authenticated;
-- Upload and queue insertion use the scoped-token edge handler, never organizer credentials.
grant all on public.reader_transfer_destinations,public.reader_import_inbox to service_role;
