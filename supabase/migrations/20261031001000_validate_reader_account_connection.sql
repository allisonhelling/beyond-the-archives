begin;
-- Check ownership before a reader claims a code or saves a local connection.
-- The existing user_id primary key remains the one-account association; device
-- registrations continue to allow that same account on multiple installations.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.reader_organizer_connection(text,uuid,text)'::regprocedure) into definition;
 updated := replace(definition, $old$ if p_action='enable' then$old$, $new$ if p_action='validate' then
  if p_secret is null or not exists (
   select 1 from public.userscript_devices where user_id=owner_id
    and (expires_at is null or expires_at>now())
    and secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
  ) then
   raise exception 'This organizer can connect only to its matching reader account. Sign in with the same account in both apps.' using errcode='42501';
  end if;
  return jsonb_build_object('userId',owner_id);
 end if;
 if p_action='enable' then$new$);
 if updated=definition then raise exception 'Review reader account validation dispatch'; end if;
 execute updated;
end;
$migration$;
commit;
