begin;
-- Credentials are independent of browser login, scoped to the companion RPC,
-- hashed at rest, single-use while pairing and individually revocable.
create table public.userscript_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 80),
 secret_hash text not null unique,
 paired boolean not null default false,
 expires_at timestamptz not null default (now() + interval '5 minutes'),
 created_at timestamptz not null default now()
);
alter table public.userscript_devices enable row level security;
alter table public.userscript_devices force row level security;
revoke all on public.userscript_devices from public, anon, authenticated;

create function public.manage_userscript_device(p_action text, p_name text default '', p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); secret text;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_action='create' then
  delete from public.userscript_devices where user_id=owner_id and (not paired or expires_at <= now());
  if (select count(*) from public.userscript_devices where user_id=owner_id) >= 20 then raise exception 'Disconnect an old device first'; end if;
  secret := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.userscript_devices(user_id,name,secret_hash)
   values(owner_id,trim(p_name),encode(sha256(convert_to(secret,'UTF8')),'hex'));
  return jsonb_build_object('code',secret);
 elsif p_action='revoke' then
  delete from public.userscript_devices where id=p_id and user_id=owner_id;
 elsif p_action <> 'list' then raise exception 'Unknown action';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'paired',paired,'expires_at',expires_at) order by created_at desc)
  from public.userscript_devices where user_id=owner_id), '[]'::jsonb);
end;
$$;
revoke all on function public.manage_userscript_device(text,text,uuid) from public, anon;
grant execute on function public.manage_userscript_device(text,text,uuid) to authenticated;

create function public.userscript_library(p_secret text, p_action text, p_work bigint default null, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare device public.userscript_devices; entry public.library_entries; result jsonb; secret text;
 previous_sub text := current_setting('request.jwt.claim.sub',true);
 previous_claims text := current_setting('request.jwt.claims',true);
 entry_id uuid; metadata jsonb;
begin
 if length(p_secret) <> 64 then raise exception 'Reconnect this device in Library Settings' using errcode='28000'; end if;
 select * into device from public.userscript_devices
  where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') and expires_at>now() for update;
 if device.id is null then raise exception 'Reconnect this device in Library Settings' using errcode='28000'; end if;
 if p_action='claim' and not device.paired then
  secret := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.userscript_devices set secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex'),paired=true,expires_at=now()+interval '90 days' where id=device.id;
  return jsonb_build_object('secret',secret,'userId',device.user_id);
 end if;
 if not device.paired then raise exception 'Pair this device first' using errcode='28000'; end if;
 if p_action='disconnect' then
  delete from public.userscript_devices where id=device.id;
  return '{}'::jsonb;
 end if;
 if p_action not in ('get','save','progress') or p_work is null or p_work<1 or p_work>9007199254740991 then raise exception 'Invalid companion request'; end if;
 -- Serializes additions for the same owner/work, including retries after lost responses.
 perform pg_advisory_xact_lock(hashtextextended(device.user_id::text || ':' || p_work::text,0));
 select e.* into entry from public.library_entries e join public.works w on w.id=e.work_id
  where e.user_id=device.user_id and w.ao3_work_id=p_work for update of e;
 if p_action in ('save','progress') then
  if (entry.id is not null and (p_input->>'version') is distinct from entry.updated_at::text)
    or (entry.id is null and p_input->>'version' is not null) then
   raise exception 'Entry changed. Reload saved entry before retrying; your draft is preserved.' using errcode='40001';
  end if;
  -- The existing atomic save enforces metadata/progress validation and ownership
  -- for collections/tags. Set only the verified device owner's identity locally.
  perform set_config('request.jwt.claim.sub',device.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',device.user_id)::text,true);
  if p_action='progress' then
   if entry.id is null then raise exception 'Save this work first'; end if;
   update public.library_entries set reading_status=(p_input->>'status')::public.reading_status,
    last_read_chapter=(p_input->>'progress')::integer where id=entry.id and user_id=device.user_id;
   entry_id := entry.id;
  else
   metadata := case when entry.id is null then p_input->'metadata' else '{}'::jsonb end;
   entry_id := public.save_library_story('https://archiveofourown.org/works/' || p_work, metadata,
    (p_input->>'status')::public.reading_status,(p_input->>'progress')::integer,p_input->>'notes',
    (p_input->>'rating')::smallint,coalesce(entry.is_favorite,false),
    array(select jsonb_array_elements_text(p_input->'collections')::uuid),
    array(select jsonb_array_elements_text(p_input->'tags')),entry.id);
   if entry.id is null then
    -- The shared save validates the initial metadata. Browser observations then
    -- belong to the existing private automatic layer, not manual overrides
    -- (which would permanently cap progress at a WIP's old chapter count).
    update public.library_entries set metadata_overrides='{}'::jsonb,
     extension_metadata=metadata || jsonb_build_object('is_complete',
      case metadata->>'publication_status' when 'complete' then true when 'in_progress' then false else null end)
     where id=entry_id and user_id=device.user_id;
   end if;
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  select * into entry from public.library_entries where id=entry_id and user_id=device.user_id;
 end if;
 if entry.id is not null then
  result := jsonb_build_object('id',entry.id,'version',entry.updated_at::text,'status',entry.reading_status,
   'progress',entry.last_read_chapter,'notes',entry.notes,'rating',entry.personal_rating,
   'collections',coalesce((select jsonb_agg(collection_id) from public.collection_works where library_entry_id=entry.id and user_id=device.user_id),'[]'::jsonb),
   'tags',coalesce((select jsonb_agg(t.name) from public.personal_tags t join public.library_entry_tags l on l.personal_tag_id=t.id where l.library_entry_id=entry.id and l.user_id=device.user_id),'[]'::jsonb));
 end if;
 return jsonb_build_object('entry',result,'collections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_position,created_at)
  from public.collections where user_id=device.user_id and default_key is null),'[]'::jsonb));
end;
$$;
revoke all on function public.userscript_library(text,text,bigint,jsonb) from public;
grant execute on function public.userscript_library(text,text,bigint,jsonb) to anon, authenticated;
commit;
