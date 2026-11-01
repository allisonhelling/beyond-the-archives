begin;
-- Only trusted operators approve addresses. An empty list denies every new signup.
create table public.beta_signup_allowlist (
 email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 created_at timestamptz not null default now()
);
alter table public.beta_signup_allowlist enable row level security;
alter table public.beta_signup_allowlist force row level security;
revoke all on public.beta_signup_allowlist from public, anon, authenticated;
grant select, insert, update, delete on public.beta_signup_allowlist to service_role;
grant usage on schema public to supabase_auth_admin;
grant select on public.beta_signup_allowlist to supabase_auth_admin;
create policy beta_signup_hook_read on public.beta_signup_allowlist
 for select to supabase_auth_admin using (true);

create function public.before_user_created(event jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 if coalesce((event->'user'->>'is_anonymous')::boolean, false)
 or not exists (
  select 1 from public.beta_signup_allowlist
  where email = lower(btrim(event->'user'->>'email'))
 ) then
  return jsonb_build_object('error', jsonb_build_object(
   'http_code', 403,
   'message', 'Private beta: this email address has not been approved for account creation.'
  ));
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
commit;
