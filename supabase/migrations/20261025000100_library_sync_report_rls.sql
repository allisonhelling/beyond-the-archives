begin;

-- Match the forced-RLS standard used by the other private library tables.
alter table public.library_sync_reports force row level security;

commit;
