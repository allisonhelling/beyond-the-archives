-- Reader access is granted explicitly, independently of organizer credentials.
create table public.reader_app_access (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.reader_app_access enable row level security;
alter table public.reader_app_access force row level security;
create policy reader_access_self on public.reader_app_access for select to authenticated using (user_id = (select auth.uid()));
grant select on public.reader_app_access to authenticated;
create function public.reader_has_access() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.reader_app_access where user_id = auth.uid())
$$;
revoke all on function public.reader_has_access() from public, anon;
grant execute on function public.reader_has_access() to authenticated;
create table public.reader_cloud_values (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null check (length(key) between 1 and 200),
 value jsonb not null,
 revision bigint not null default 1,
 primary key(user_id,key)
);
create table public.reader_cloud_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 result jsonb not null,
 primary key(user_id,id)
);
alter table public.reader_cloud_values enable row level security;
alter table public.reader_cloud_values force row level security;
alter table public.reader_cloud_receipts enable row level security;
alter table public.reader_cloud_receipts force row level security;
create policy reader_values_self on public.reader_cloud_values for select to authenticated using (user_id = (select auth.uid()) and public.reader_has_access());
grant select on public.reader_cloud_values to authenticated;
-- Writes only through the checked, idempotent RPC. Serialize per owner to cover absent keys too.
create function public.reader_cloud_apply(p_id uuid, p_key text, p_value jsonb, p_base bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.reader_cloud_values; result jsonb;
begin
 if owner_id is null or not public.reader_has_access() then raise exception 'Reader cloud access has not been granted'; end if;
 if p_id is null or p_key is null or length(p_key) not between 1 and 200 or p_value is null or octet_length(p_value::text) > 2097152 or p_base is null or p_base < 0 then raise exception 'Invalid reader change'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 30));
 select r.result into result from public.reader_cloud_receipts r where r.user_id = owner_id and r.id = p_id;
 if found then return result; end if;
 select * into current_row from public.reader_cloud_values where user_id = owner_id and key = p_key;
 if coalesce(current_row.revision,0) <> p_base and current_row.value is distinct from p_value then
  return jsonb_build_object('conflict',true,'key',p_key,'value',current_row.value,'revision',coalesce(current_row.revision,0));
 end if;
 insert into public.reader_cloud_values(user_id,key,value,revision) values(owner_id,p_key,p_value,coalesce(current_row.revision,0)+1)
 on conflict(user_id,key) do update set value=excluded.value, revision=excluded.revision
 returning jsonb_build_object('key',key,'value',value,'revision',revision) into result;
 insert into public.reader_cloud_receipts values(owner_id,p_id,result);
 return result;
end $$;
revoke all on function public.reader_cloud_apply(uuid,text,jsonb,bigint) from public, anon;
grant execute on function public.reader_cloud_apply(uuid,text,jsonb,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('reader-epubs','reader-epubs',false,52428800,array['application/epub+zip']) on conflict(id) do nothing;
create policy reader_epub_read on storage.objects for select to authenticated using (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access());
create policy reader_epub_insert on storage.objects for insert to authenticated with check (
 bucket_id='reader-epubs' and split_part(name,'/',1)=(select auth.uid())::text and public.reader_has_access()
 and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.epub$');
-- Hash-addressed original files are immutable; retrying an upload cannot replace another version.
