begin;

-- Removing a stale availability report does not revoke its credential, disconnect
-- the account, or delete EPUBs. An active installation can report again normally.
do $migration$ declare definition text; updated text; begin
 select pg_get_functiondef('public.reader_organizer_connection(text,uuid,text)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_action='enable' then$old$,$new$ if p_action='forget_report' then
  if p_installation is null then raise exception 'Report identity required' using errcode='22023'; end if;
  delete from public.reader_availability where user_id=owner_id and installation_id=p_installation;
  return jsonb_build_object('enabled',exists(select 1 from public.reader_organizer_links where user_id=owner_id));
 end if;
 if p_action='enable' then$new$);
 if updated=definition then raise exception 'Review installation report removal'; end if;
 execute updated;
end $migration$;

notify pgrst,'reload schema';
commit;
