begin;

-- Use the existing paired-device, owner and AO3 work checks and row lock.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, $old$if p_action not in ('get','save','progress','refresh_metadata')$old$,
  $new$if p_action not in ('get','save','progress','refresh_metadata','delete_entry')$new$);
 if updated = definition then raise exception 'Review companion action allowlist'; end if;
 definition := updated;
 updated := replace(definition, $old$for update of e;$old$, $new$for update of e;
 if p_action='delete_entry' then
  if p_input->>'id' is null or p_input->>'version' is null then
   raise exception 'A saved entry and version are required' using errcode='22023';
  end if;
  if entry.id is not null then
   if (p_input->>'id') is distinct from entry.id::text or (p_input->>'version') is distinct from entry.updated_at::text then
    raise exception 'Entry changed. Reload saved entry before retrying.' using errcode='40001';
   end if;
   delete from public.library_entries where id=entry.id and user_id=device.user_id;
   entry := null;
  end if;
 end if;$new$);
 if updated = definition then raise exception 'Review companion work row lock'; end if;
 execute updated;
end;
$migration$;

commit;
