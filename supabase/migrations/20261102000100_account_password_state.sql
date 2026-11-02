begin;
create function public.account_has_password()
returns boolean
language sql stable security definer
set search_path = ''
as $$
 select coalesce((select encrypted_password <> '' from auth.users
 where id = auth.uid() and not coalesce(is_anonymous, false)), false)
$$;
revoke all on function public.account_has_password() from public, anon;
grant execute on function public.account_has_password() to authenticated;
commit;
