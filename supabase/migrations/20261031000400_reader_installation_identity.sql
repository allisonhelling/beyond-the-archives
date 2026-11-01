begin;

-- A browser installation has one current report per organizer owner, even if its
-- paired credential changes. Keep the newest report when upgrading old rows.
delete from public.reader_availability older using public.reader_availability newer
where older.user_id=newer.user_id and older.installation_id=newer.installation_id
 and (older.reported_at,older.device_id)<(newer.reported_at,newer.device_id);
alter table public.reader_availability drop constraint reader_availability_pkey;
alter table public.reader_availability add primary key(user_id,installation_id);

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$  insert into public.reader_availability(device_id,user_id,installation_id,name,url,works)$old$,$new$  if p_input ? 'previousInstallationIds' then
   if jsonb_typeof(p_input->'previousInstallationIds') is distinct from 'array'
    or jsonb_array_length(p_input->'previousInstallationIds')>100
    or exists(select 1 from jsonb_array_elements(p_input->'previousInstallationIds') v
     where jsonb_typeof(v)<>'string' or (v #>> '{}') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
    raise exception 'Invalid previous reader installations' using errcode='22023';
   end if;
   -- Only aliases discovered in this browser, on this origin and for this owner.
   -- Independent installations are never merged by name.
   delete from public.reader_availability r where r.user_id=device.user_id and r.url=p_input->>'url'
    and r.installation_id<>(p_input->>'installationId')::uuid
    and r.installation_id in(select value::uuid from jsonb_array_elements_text(p_input->'previousInstallationIds'));
  end if;
  insert into public.reader_availability(device_id,user_id,installation_id,name,url,works)$new$);
 if updated=definition then raise exception 'Review reader report installation migration'; end if;
 definition:=updated;
 updated:=replace(definition,'on conflict(device_id,installation_id) do update set installation_id=excluded.installation_id',
  'on conflict(user_id,installation_id) do update set device_id=excluded.device_id');
 if updated=definition then raise exception 'Review reader report upsert migration'; end if;
 execute updated;
end;
$migration$;

commit;
