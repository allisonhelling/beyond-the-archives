-- Usernames are assigned by trusted operators in Auth app_metadata, never by
-- public profile updates. Email addresses are visible only to the login server.
-- Auth owns auth.users on hosted Supabase. Only read its existing columns;
-- reject ambiguous usernames instead of creating an index on a managed table.

create function public.account_login_email(p_username text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when count(*) = 1
    and bool_and(email_confirmed_at is not null and not coalesce(is_anonymous, false))
    then min(email) end
  from auth.users
  where lower(btrim(raw_app_meta_data->>'username')) = lower(btrim(p_username))
    and btrim(p_username) <> ''
$$;

revoke all on function public.account_login_email(text) from public, anon, authenticated;
grant execute on function public.account_login_email(text) to service_role;
