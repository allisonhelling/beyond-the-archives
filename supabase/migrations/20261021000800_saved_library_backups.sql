begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('library-backups','library-backups',false,52428800,array['application/json','application/gzip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Each account owns a folder; backups are immutable snapshots. No UPDATE policy
-- means a new backup cannot overwrite an older copy, even with upsert requested.
create policy library_backups_read on storage.objects for select to authenticated
using(bucket_id='library-backups' and split_part(name,'/',1)=(select auth.uid()::text));
create policy library_backups_insert on storage.objects for insert to authenticated
with check(bucket_id='library-backups' and split_part(name,'/',1)=(select auth.uid()::text));
create policy library_backups_delete on storage.objects for delete to authenticated
using(bucket_id='library-backups' and split_part(name,'/',1)=(select auth.uid()::text));

-- PostgREST honors per-function timeout settings, without extending other app
-- requests. The measured 10,000-work restores exceed the default API timeout.
alter function public.export_library_backup() set statement_timeout='60s';
alter function public.restore_library_backup(jsonb,uuid,boolean) set statement_timeout='60s';
notify pgrst, 'reload schema';
commit;
