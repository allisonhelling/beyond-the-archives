begin;
-- Account association only. Companion secrets remain hashed and scoped per device.
create table public.reader_organizer_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.reader_organizer_links enable row level security;
alter table public.reader_organizer_links force row level security;
revoke all on public.reader_organizer_links from public, anon, authenticated;
grant select on public.reader_organizer_links to authenticated;
create policy reader_organizer_self on public.reader_organizer_links for select to authenticated using(user_id=(select auth.uid()));
grant all on public.reader_organizer_links to service_role;
create table public.reader_organizer_devices (
 user_id uuid not null references public.reader_organizer_links(user_id) on delete cascade,
 installation uuid not null,
 device uuid not null references public.userscript_devices(id) on delete cascade,
 primary key(user_id,installation)
);
alter table public.reader_organizer_devices enable row level security;
alter table public.reader_organizer_devices force row level security;
revoke all on public.reader_organizer_devices from public, anon, authenticated;
create function public.reader_organizer_connection(p_action text, p_installation uuid default null, p_secret text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); secret text; device_id uuid;
begin
 if owner_id is null or not public.reader_has_access() then raise exception 'Reader account access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,31));
 if p_action='enable' then
  if p_secret is not null and not exists(select 1 from public.userscript_devices where user_id=owner_id and paired and expires_at>now() and secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')) then
   raise exception 'The organizer connection belongs to a different account or has expired' using errcode='42501';
  end if;
  insert into public.reader_organizer_links(user_id) values(owner_id) on conflict do nothing;
  if p_secret is not null and p_installation is not null then
   select id into device_id from public.userscript_devices where user_id=owner_id and paired and secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
   insert into public.reader_organizer_devices values(owner_id,p_installation,device_id) on conflict(user_id,installation) do update set device=excluded.device;
  end if;
 elsif p_action='disable' then
  delete from public.userscript_devices where id in(select device from public.reader_organizer_devices where user_id=owner_id);
  delete from public.reader_organizer_links where user_id=owner_id;
 elsif p_action not in('status','restore') then raise exception 'Unknown connection action';
 end if;
 if not exists(select 1 from public.reader_organizer_links where user_id=owner_id) then return jsonb_build_object('enabled',false); end if;
 if p_action='restore' then
  if p_installation is null then raise exception 'Device identity required'; end if;
  -- Retry/expiry rotates only this installation's credential, never another device's.
  delete from public.userscript_devices where id in(select device from public.reader_organizer_devices where user_id=owner_id and installation=p_installation);
  delete from public.userscript_devices where user_id=owner_id and expires_at<=now();
  if(select count(*) from public.userscript_devices where user_id=owner_id)>=20 then raise exception 'Disconnect an old device first'; end if;
  secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.userscript_devices(user_id,name,secret_hash,paired,expires_at)
   values(owner_id,'Reader Account Device',encode(sha256(convert_to(secret,'UTF8')),'hex'),true,now()+interval '90 days') returning id into device_id;
  insert into public.reader_organizer_devices values(owner_id,p_installation,device_id);
  return jsonb_build_object('enabled',true,'secret',secret,'userId',owner_id,'expiresAt',now()+interval '90 days');
 end if;
 return jsonb_build_object('enabled',true);
end $$;
revoke all on function public.reader_organizer_connection(text,uuid,text) from public,anon;
grant execute on function public.reader_organizer_connection(text,uuid,text) to authenticated;

-- A verifier-bound, origin-bound, one-time login handoff. No sessions are stored here.
create table public.app_login_handoffs (
 code_hash text primary key check(length(code_hash)=64),
 challenge text not null check(length(challenge)=64),
 user_id uuid not null references auth.users(id) on delete cascade,
 target_origin text not null,
 expires_at timestamptz not null default(now()+interval '60 seconds')
);
alter table public.app_login_handoffs enable row level security;
alter table public.app_login_handoffs force row level security;
revoke all on public.app_login_handoffs from public,anon,authenticated;
grant all on public.app_login_handoffs to service_role;
create function public.consume_app_login_handoff(p_hash text,p_challenge text,p_origin text)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 delete from public.app_login_handoffs where code_hash=p_hash and challenge=p_challenge and target_origin=p_origin and expires_at>now()
  and exists(select 1 from public.reader_organizer_links l where l.user_id=app_login_handoffs.user_id)
 returning user_id into owner_id;
 return owner_id;
end $$;
revoke all on function public.consume_app_login_handoff(text,text,text) from public,anon,authenticated;
grant execute on function public.consume_app_login_handoff(text,text,text) to service_role;
commit;
