begin;

-- Only the trusted save endpoint may create objects. Read/download/delete stay
-- owner-scoped, and local exports never touch this gate.
drop policy library_backups_insert on storage.objects;

create table public.backup_save_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 attempted_at timestamptz,
 lease_token uuid,
 lease_until timestamptz
);
alter table public.backup_save_state enable row level security;
alter table public.backup_save_state force row level security;
revoke all on public.backup_save_state from public,anon,authenticated;
grant all on public.backup_save_state to service_role;

create function public.claim_backup_save(p_user uuid,p_create boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare state public.backup_save_state; token uuid:=gen_random_uuid();
begin
 insert into public.backup_save_state(user_id) values(p_user) on conflict do nothing;
 select * into state from public.backup_save_state where user_id=p_user for update;
 if state.lease_until>clock_timestamp() then
  return jsonb_build_object('error','busy','retry_after',greatest(1,ceil(extract(epoch from state.lease_until-clock_timestamp()))::integer));
 end if;
 if p_create and state.attempted_at>clock_timestamp()-interval '1 minute' then
  return jsonb_build_object('error','rate_limited','retry_after',greatest(1,ceil(extract(epoch from state.attempted_at+interval '1 minute'-clock_timestamp()))::integer));
 end if;
 -- Longer than an Edge worker's maximum lifetime; a crashed worker cannot
 -- overlap a new lease. A normal request releases immediately, even on failure.
 update public.backup_save_state set lease_token=token,lease_until=clock_timestamp()+interval '10 minutes',
  attempted_at=case when p_create then clock_timestamp() else attempted_at end where user_id=p_user;
 return jsonb_build_object('token',token);
end;
$$;

create function public.release_backup_save(p_user uuid,p_token uuid) returns void
language sql security definer set search_path='' as $$
 update public.backup_save_state set lease_token=null,lease_until=null
 where user_id=p_user and lease_token=p_token;
$$;

-- Reading Storage metadata is safe; actual deletion must use the Storage API
-- so both metadata and the underlying file are removed.
create function public.backup_storage_files(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',name,'name',split_part(name,'/',2),
  'createdAt',created_at,'size',coalesce((metadata->>'size')::bigint,0)) order by created_at desc,name desc),'[]')
 from storage.objects where bucket_id='library-backups' and split_part(name,'/',1)=p_user::text;
$$;
revoke all on function public.claim_backup_save(uuid,boolean),public.release_backup_save(uuid,uuid),public.backup_storage_files(uuid) from public,anon,authenticated;
grant execute on function public.claim_backup_save(uuid,boolean),public.release_backup_save(uuid,uuid),public.backup_storage_files(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
