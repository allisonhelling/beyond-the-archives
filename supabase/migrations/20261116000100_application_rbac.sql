begin;

-- Application authority only. These identifiers never become PostgreSQL roles,
-- JWT database roles, infrastructure credentials, or private-library RLS exceptions.
create table public.app_roles (
 id text primary key check (id in ('user','admin','owner'))
);
create table public.app_permissions (
 id text primary key check (id in ('audit.read_limited','roles.assign_admin','roles.revoke_admin','roles.transfer_owner','permissions.manage'))
);
create table public.role_permissions (
 role_id text not null references public.app_roles(id),
 permission_id text not null references public.app_permissions(id),
 primary key (role_id,permission_id),
 check (role_id='owner' or role_id='admin' and permission_id='audit.read_limited')
);
create table public.user_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role_id text not null default 'user' references public.app_roles(id)
);
create unique index user_roles_single_owner on public.user_roles(role_id) where role_id='owner';
create table public.admin_audit_logs (
 id bigint generated always as identity primary key,
 request_id uuid not null,
 actor_id uuid,
 actor_role text not null check (actor_role in ('user','admin','owner','infrastructure')),
 target_id uuid,
 action text not null check (action in ('assign_admin','revoke_admin','transfer_owner','set_admin_permission','read_audit','bootstrap_owner','recover_owner')),
 outcome text not null check (outcome in ('succeeded','denied')),
 code text not null check (code in ('ok','forbidden','fresh_mfa_required','invalid_request','ineligible_target','invalid_transition')),
 previous_role text check (previous_role in ('user','admin','owner')),
 next_role text check (next_role in ('user','admin','owner')),
 permission_id text references public.app_permissions(id),
 permission_enabled boolean,
 operator_reference text check (operator_reference ~ '^[A-Za-z0-9_-]{8,80}$'),
 occurred_at timestamptz not null default clock_timestamp(),
 check ((actor_role='infrastructure') = (actor_id is null)),
 check ((action in ('bootstrap_owner','recover_owner')) = (operator_reference is not null))
);
-- Audit IDs deliberately survive Auth deletion. No emails, names, arbitrary JSON,
-- library metadata, tokens, free-form errors or user-controlled messages are stored.
create unique index admin_audit_actor_request on public.admin_audit_logs(actor_id,request_id) where actor_id is not null;
create unique index admin_audit_operator_request on public.admin_audit_logs(request_id) where actor_id is null;
create unique index admin_audit_once_bootstrap on public.admin_audit_logs(action) where action='bootstrap_owner' and outcome='succeeded';

alter table public.app_roles enable row level security;
alter table public.app_roles force row level security;
alter table public.app_permissions enable row level security;
alter table public.app_permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
revoke all on public.app_roles,public.app_permissions,public.role_permissions,public.user_roles,public.admin_audit_logs from public,anon,authenticated,service_role;
revoke all on sequence public.admin_audit_logs_id_seq from public,anon,authenticated,service_role;

insert into public.app_roles values ('user'),('admin'),('owner');
insert into public.app_permissions values ('audit.read_limited'),('roles.assign_admin'),('roles.revoke_admin'),('roles.transfer_owner'),('permissions.manage');
insert into public.role_permissions select 'owner',id from public.app_permissions;
insert into public.role_permissions values ('admin','audit.read_limited');
insert into public.user_roles(user_id) select id from auth.users;

create function public.initialize_app_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.user_roles(user_id) values(new.id);
 return new;
end $$;
create trigger initialize_app_role after insert on auth.users for each row execute function public.initialize_app_role();

create function public.protect_admin_audit() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Administrative audit is append-only' using errcode='42501';
end $$;
create trigger protect_admin_audit before update or delete or truncate on public.admin_audit_logs
for each statement execute function public.protect_admin_audit();

-- A deferred invariant permits the demote/promote pair inside one transaction.
-- The partial unique index independently prevents two concurrent owners.
create function public.check_app_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.admin_audit_logs where action='bootstrap_owner' and outcome='succeeded')
 and (select count(*) from public.user_roles r join auth.users u on u.id=r.user_id
  where r.role_id='owner' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())) <> 1 then
  raise exception 'Exactly one active application owner is required' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger check_app_owner after insert or update or delete on public.user_roles
deferrable initially deferred for each row execute function public.check_app_owner();

-- Auth deletion/ban/deconfirmation must not silently remove the active owner.
-- MFA-factor loss instead disables privileged actions until operator recovery.
create function public.protect_app_owner_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.user_roles where user_id=old.id and role_id='owner') then
  if tg_op='DELETE' then
   raise exception 'Transfer or recover application ownership before deleting the owner' using errcode='23514';
  end if;
  if new.id<>old.id or new.email_confirmed_at is null or coalesce(new.is_anonymous,false)
   or new.deleted_at is not null or new.banned_until>clock_timestamp() then
   raise exception 'Transfer or recover application ownership before disabling the owner' using errcode='23514';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_app_owner_identity before update or delete on auth.users
for each row execute function public.protect_app_owner_identity();

-- The ID comes only from the signed PostgREST identity. The role, session,
-- account status, MFA factor and freshness come from live trusted DB rows.
create function public.app_actor(p_require_mfa boolean) returns text
language plpgsql security definer set search_path='' as $$
declare
 claims jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 actor uuid := auth.uid();
 v_actor_role text;
begin
 if actor is null then return null; end if;
 perform 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
 if not found then return null; end if;
 select role_id into v_actor_role from public.user_roles where user_id=actor;
 if v_actor_role is null then return null; end if;
 if p_require_mfa then
  if claims->>'aal' is distinct from 'aal2' then return null; end if;
  perform 1 from auth.sessions s
   join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
   join auth.mfa_amr_claims m on m.session_id=s.id and m.authentication_method='totp'
   where s.id::text=claims->>'session_id' and s.user_id=actor and s.aal='aal2'
    and (s.not_after is null or s.not_after>clock_timestamp())
    and f.status='verified' and f.factor_type='totp'
    and m.updated_at between clock_timestamp()-interval '5 minutes' and clock_timestamp()
   for share of s,f,m;
  if not found then return null; end if;
 end if;
 return v_actor_role;
end $$;

create function public.app_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor_role text := public.app_actor(false);
begin
 if v_actor_role is null then raise exception 'Sign in with a confirmed account' using errcode='42501'; end if;
 return jsonb_build_object('role',v_actor_role,'permissions',coalesce(
  (select jsonb_agg(permission_id order by permission_id) from public.role_permissions where role_id=v_actor_role),'[]'::jsonb));
end $$;

-- One fixed action allowlist, not an unrestricted account-update endpoint.
-- Expected denials RETURN a result so their audit entry commits. SQL exceptions
-- (including audit-write failure) roll back both the change and success event.
create function public.admin_access(p_request_id uuid,p_action text,p_target uuid default null,p_permission text default null,p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid();
 v_actor_role text;
 required_permission text;
 target_role text;
 next_role text;
 code text := 'ok';
 events jsonb;
begin
 -- Serialize authorization, role/permission changes, bootstrap and recovery.
 perform 1 from public.app_roles where id='owner' for update;
 v_actor_role := public.app_actor(false);
 if v_actor_role is null then raise exception 'Sign in with a confirmed account' using errcode='42501'; end if;
 if p_request_id is null then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
 if exists(select 1 from public.admin_audit_logs where actor_id=actor and request_id=p_request_id) then
  -- Check current authorization even on replay; never disclose prior results.
  return jsonb_build_object('ok',false,'code','request_already_used','request_id',p_request_id);
 end if;
 required_permission := case p_action
  when 'assign_admin' then 'roles.assign_admin' when 'revoke_admin' then 'roles.revoke_admin'
  when 'transfer_owner' then 'roles.transfer_owner' when 'set_admin_permission' then 'permissions.manage'
  when 'read_audit' then 'audit.read_limited' end;
 if required_permission is null then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
 if not exists(select 1 from public.role_permissions where role_id=v_actor_role and permission_id=required_permission)
  or p_action<>'read_audit' and v_actor_role<>'owner' then code:='forbidden';
 elsif public.app_actor(true) is null then code:='fresh_mfa_required';
 elsif p_action in ('assign_admin','revoke_admin','transfer_owner') then
  if p_target is null or p_target=actor or p_permission is not null or p_enabled is not null then code:='invalid_request';
  else
   perform 1 from auth.users u where u.id=p_target and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
   if not found then code:='ineligible_target';
   else
    select role_id into target_role from public.user_roles where user_id=p_target for update;
    if p_action='assign_admin' and target_role='user' then next_role:='admin';
    elsif p_action='revoke_admin' and target_role='admin' then next_role:='user';
    elsif p_action='transfer_owner' and target_role in ('user','admin')
     and exists(select 1 from auth.mfa_factors where user_id=p_target and factor_type='totp' and status='verified') then next_role:='owner';
    else code:='invalid_transition'; end if;
   end if;
  end if;
 elsif p_action='set_admin_permission' then
  if p_target is not null or p_permission is distinct from 'audit.read_limited' or p_enabled is null then code:='invalid_request'; end if;
 elsif p_target is not null or p_permission is not null or p_enabled is not null then code:='invalid_request';
 end if;

 if code='ok' then
  if p_action='transfer_owner' then update public.user_roles set role_id='user' where user_id=actor; end if;
  if next_role is not null then update public.user_roles set role_id=next_role where user_id=p_target;
  elsif p_action='set_admin_permission' then
   if p_enabled then insert into public.role_permissions values('admin',p_permission) on conflict do nothing;
   else delete from public.role_permissions where role_id='admin' and permission_id=p_permission; end if;
  end if;
 end if;
 insert into public.admin_audit_logs(request_id,actor_id,actor_role,target_id,action,outcome,code,previous_role,next_role,permission_id,permission_enabled)
 values(p_request_id,actor,v_actor_role,p_target,p_action,case when code='ok' then 'succeeded' else 'denied' end,code,
  case when code='ok' then target_role end,case when code='ok' then next_role end,
  case when p_action='set_admin_permission' and p_permission='audit.read_limited' then p_permission end,
  case when p_action='set_admin_permission' and code='ok' then p_enabled end);
 if code='ok' and p_action='read_audit' then
  -- Admin sees only their own events; Owner sees the same redacted fields globally.
  -- No actor/target identifiers, account directory or private data joins.
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]'::jsonb) into events from (
   select id,request_id,action,outcome,occurred_at from public.admin_audit_logs
   where v_actor_role='owner' or actor_id=actor order by id desc limit 50
  ) e;
 end if;
 return jsonb_build_object('ok',code='ok','code',code,'request_id',p_request_id)
  || case when events is not null then jsonb_build_object('events',events) else '{}'::jsonb end;
end $$;

-- No API role may execute this function, including service_role. The independently
-- authorized infrastructure operator verifies the successor UUID out of band.
create function public.app_owner_maintenance(p_request_id uuid,p_action text,p_target uuid,p_operator_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare former uuid; target_role text;
begin
 perform 1 from public.app_roles where id='owner' for update;
 if p_request_id is null or p_action is null or p_action not in ('bootstrap_owner','recover_owner')
  or p_target is null or p_operator_reference is null or p_operator_reference !~ '^[A-Za-z0-9_-]{8,80}$' then
  raise exception 'Invalid owner maintenance request' using errcode='22023';
 end if;
 if exists(select 1 from public.admin_audit_logs where actor_id is null and request_id=p_request_id) then
  raise exception 'Owner maintenance request already used' using errcode='22023';
 end if;
 select user_id into former from public.user_roles where role_id='owner' for update;
 if p_action='bootstrap_owner' and (former is not null or exists(select 1 from public.admin_audit_logs where action='bootstrap_owner' and outcome='succeeded'))
  or p_action='recover_owner' and not exists(select 1 from public.admin_audit_logs where action='bootstrap_owner' and outcome='succeeded') then
  raise exception 'Owner maintenance state does not match the requested operation' using errcode='23514';
 end if;
 perform 1 from auth.users u where u.id=p_target and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
 if not found or not exists(select 1 from auth.mfa_factors where user_id=p_target and factor_type='totp' and status='verified') then
  raise exception 'Owner successor must be confirmed, active and MFA-enrolled' using errcode='23514';
 end if;
 select role_id into target_role from public.user_roles where user_id=p_target for update;
 if target_role is null or target_role='owner' then raise exception 'Owner successor must be a different user or admin' using errcode='23514'; end if;
 if former is not null then update public.user_roles set role_id='user' where user_id=former; end if;
 update public.user_roles set role_id='owner' where user_id=p_target;
 insert into public.admin_audit_logs(request_id,actor_role,target_id,action,outcome,code,previous_role,next_role,operator_reference)
 values(p_request_id,'infrastructure',p_target,p_action,'succeeded','ok',target_role,'owner',p_operator_reference);
 return jsonb_build_object('ok',true,'request_id',p_request_id);
end $$;

-- Explicit EXECUTE boundary: helpers/triggers/operator procedure have no API
-- callers. Only the self-authorization reader and fixed-action RPC are exposed.
revoke all on function public.initialize_app_role(),public.protect_admin_audit(),public.check_app_owner(),public.protect_app_owner_identity(),public.app_actor(boolean),public.app_access(),public.admin_access(uuid,text,uuid,text,boolean),public.app_owner_maintenance(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.app_access(),public.admin_access(uuid,text,uuid,text,boolean) to authenticated;
commit;
