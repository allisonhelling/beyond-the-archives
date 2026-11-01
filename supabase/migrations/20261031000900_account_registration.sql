begin;
-- Reserve the username in the same transaction as Auth account creation.
-- Existing invitations/admin-created accounts may omit a username and choose
-- one later. Changes to user metadata cannot rename a saved login username.
create function public.initialize_account_username() returns trigger
language plpgsql security definer set search_path='' as $$
declare chosen text := btrim(new.raw_user_meta_data->>'username');
begin
 if chosen is null then return new; end if;
 if chosen !~ '^[A-Za-z0-9_]{3,30}$' or coalesce(new.is_anonymous,false) then
  raise exception 'Use 3–30 letters, numbers, or underscores for your username' using errcode='22023';
 end if;
 insert into public.account_usernames(user_id,username) values(new.id,chosen);
 return new;
end $$;
revoke all on function public.initialize_account_username() from public,anon,authenticated;
create trigger initialize_account_username after insert on auth.users
for each row execute function public.initialize_account_username();
commit;
