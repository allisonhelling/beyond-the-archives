-- Usernames are assigned by trusted operators in Auth app_metadata, never by
-- public profile updates. Email addresses are visible only to the login server.
create unique index auth_users_login_username on auth.users
  (lower(btrim(raw_app_meta_data->>'username')))
  where btrim(raw_app_meta_data->>'username') <> '';

create function public.account_login_email(p_username text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select email from auth.users
  where lower(btrim(raw_app_meta_data->>'username')) = lower(btrim(p_username))
    and btrim(p_username) <> ''
    and email_confirmed_at is not null
    and not coalesce(is_anonymous, false)
$$;

revoke all on function public.account_login_email(text) from public, anon, authenticated;
grant execute on function public.account_login_email(text) to service_role;
