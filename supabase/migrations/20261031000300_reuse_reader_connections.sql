begin;

-- A reconnect proves both credentials belong to the same owner. Keep the existing
-- reader secret/baselines, and discard only the redundant, unclaimed pairing code.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_action='claim' and not device.paired then$old$,$new$ if p_action='claim' and p_input ? 'existingSecret' then
  if jsonb_typeof(p_input->'existingSecret') is distinct from 'string' or length(p_input->>'existingSecret')<>64
   or not exists(select 1 from public.userscript_devices d where d.user_id=device.user_id and d.paired and (d.expires_at is null or d.expires_at>now())
    and d.secret_hash=encode(sha256(convert_to(p_input->>'existingSecret','UTF8')),'hex')) then
   raise exception 'The reader is connected to a different organizer account or its credential has expired' using errcode='28000';
  end if;
  if not device.paired then delete from public.userscript_devices where id=device.id; end if;
  return jsonb_build_object('secret',p_input->>'existingSecret','userId',device.user_id,'reused',true);
 end if;
 if p_action='claim' and not device.paired then$new$);
 if updated=definition then raise exception 'Review reader reconnect dispatch'; end if;
 execute updated;

 -- Replacing a registration must not leave its old reader credential orphaned.
 select pg_get_functiondef('public.reader_organizer_connection(text,uuid,text)'::regprocedure) into definition;
 updated:=replace(definition,$old$   insert into public.reader_organizer_devices values(owner_id,p_installation,device_id) on conflict(user_id,installation) do update set device=excluded.device;$old$,$new$   delete from public.userscript_devices d where d.user_id=owner_id and d.id<>device_id
    and d.id in(select r.device from public.reader_organizer_devices r where r.user_id=owner_id and r.installation=p_installation);
   insert into public.reader_organizer_devices values(owner_id,p_installation,device_id) on conflict(user_id,installation) do update set device=excluded.device;$new$);
 if updated=definition then raise exception 'Review reader registration replacement'; end if;
 -- Paired companions already use NULL for persistent authorization. Account adoption
 -- and restoration must use that same contract rather than reject or expire it.
 updated:=replace(updated,'and expires_at>now() and secret_hash','and (expires_at is null or expires_at>now()) and secret_hash');
 updated:=replace(updated,$old$true,now()+interval '90 days') returning$old$,$new$true,null) returning$new$);
 updated:=replace(updated,$old$'expiresAt',now()+interval '90 days'$old$,$new$'expiresAt',null$new$);
 execute updated;
end;
$migration$;

update public.userscript_devices d set expires_at=null where d.paired and d.expires_at>now()
 and exists(select 1 from public.reader_organizer_devices r where r.device=d.id);
commit;
