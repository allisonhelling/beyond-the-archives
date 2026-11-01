begin;

-- Keep user-chosen login names in an application-owned table. Auth remains
-- responsible for passwords, verified emails, and account identity.
create table public.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,30}$')
);
create unique index account_usernames_unique on public.account_usernames(lower(username));
alter table public.account_usernames enable row level security;
revoke all on public.account_usernames from public, anon, authenticated;

create function public.manage_account_username(p_username text default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  chosen text := btrim(p_username);
  saved text;
begin
  if owner_id is null or not exists (
    select 1 from auth.users where id = owner_id
      and email_confirmed_at is not null and not coalesce(is_anonymous, false)
  ) then
    raise exception 'Sign in to manage your username' using errcode = '42501';
  end if;
  if p_username is not null then
    if chosen !~ '^[A-Za-z0-9_]{3,30}$' then
      raise exception 'Use 3–30 letters, numbers, or underscores' using errcode = '22023';
    end if;
    insert into public.account_usernames(user_id, username) values (owner_id, chosen)
    on conflict (user_id) do update set username = excluded.username;
  end if;
  select username into saved from public.account_usernames where user_id = owner_id;
  return saved;
end;
$$;
revoke all on function public.manage_account_username(text) from public, anon;
grant execute on function public.manage_account_username(text) to authenticated;

create or replace function public.account_login_email(p_username text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select account.email from public.account_usernames names
  join auth.users account on account.id = names.user_id
  where lower(names.username) = lower(btrim(p_username))
    and account.email_confirmed_at is not null
    and not coalesce(account.is_anonymous, false)
$$;
revoke all on function public.account_login_email(text) from public, anon, authenticated;
grant execute on function public.account_login_email(text) to service_role;

commit;
