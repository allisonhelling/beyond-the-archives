begin;
-- An explicit sign-in does not enable organizer synchronization. Automatic
-- handoffs still require the account's existing organizer association.
alter table public.app_login_handoffs add column user_requested boolean not null default false;
create or replace function public.consume_app_login_handoff(p_hash text,p_challenge text,p_origin text)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 delete from public.app_login_handoffs where code_hash=p_hash and challenge=p_challenge and target_origin=p_origin and expires_at>now()
  and (user_requested or exists(select 1 from public.reader_organizer_links l where l.user_id=app_login_handoffs.user_id))
 returning user_id into owner_id;
 return owner_id;
end $$;
revoke all on function public.consume_app_login_handoff(text,text,text) from public,anon,authenticated;
grant execute on function public.consume_app_login_handoff(text,text,text) to service_role;
commit;
