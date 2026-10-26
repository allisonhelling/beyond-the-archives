begin;

-- Never restore credentials whose previous authorization already expired.
alter table public.userscript_devices alter column expires_at drop not null;
update public.userscript_devices set expires_at = null where paired and expires_at > now();
alter table public.userscript_devices add constraint userscript_pairing_requires_expiry
 check (paired or expires_at is not null);

-- Preserve the existing authentication, single-use secret rotation, account
-- isolation, revocation, and five-minute expiry of unclaimed pairing codes.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, 'and expires_at>now() for update',
  'and (expires_at>now() or (paired and expires_at is null)) for update');
 updated := replace(updated, 'paired=true,expires_at=now()+interval ''90 days''', 'paired=true,expires_at=null');
 if updated=definition or updated not like '%(paired and expires_at is null)%'
  or updated not like '%paired=true,expires_at=null%' then
  raise exception 'Review persistent companion authentication';
 end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
