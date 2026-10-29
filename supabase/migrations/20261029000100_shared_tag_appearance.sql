begin;

-- Reuse the owner-scoped preferences row and its existing backup/export path.
alter table public.metadata_preferences add column tag_appearance jsonb;
create function public.tag_appearance_settings(p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); saved jsonb; next_value jsonb; item record;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':tag-appearance',0));
 select tag_appearance into saved from public.metadata_preferences where user_id=owner_id;
 if p_input ? 'tagAppearance' then
  next_value:=p_input->'tagAppearance';
  if jsonb_typeof(next_value) is distinct from 'object' or not (p_input ? 'base')
   or jsonb_typeof(next_value->'shape') is distinct from 'string'
   or next_value->>'shape' not in ('filled','pill','curved','sharp','bullets','commas')
   or jsonb_typeof(next_value->'colors') is distinct from 'object'
   or next_value - 'shape' - 'colors' <> '{}'::jsonb then
   raise exception 'Invalid tag appearance' using errcode='22023';
  end if;
  for item in select * from jsonb_each(next_value->'colors') loop
   if item.key not in ('relationships','characters','tags','warnings','collections','personalTags')
    or jsonb_typeof(item.value) is distinct from 'string' or (item.value #>> '{}') !~ '^#[a-fA-F0-9]{6}$' then
    raise exception 'Invalid tag color' using errcode='22023';
   end if;
  end loop;
  if nullif(p_input->'base','null'::jsonb) is distinct from saved and next_value is distinct from saved then
   raise exception 'Tag appearance changed on another device. Reload before saving.' using errcode='40001';
  end if;
  insert into public.metadata_preferences(user_id,tag_appearance) values(owner_id,next_value)
   on conflict(user_id) do update set tag_appearance=excluded.tag_appearance;
  saved:=next_value;
 end if;
 return jsonb_build_object('tagAppearance',saved);
end;
$$;
revoke all on function public.tag_appearance_settings(jsonb) from public,anon;
grant execute on function public.tag_appearance_settings(jsonb) to authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_action='disconnect' then$old$,$new$ if p_action in ('tag_get','tag_save') then
  perform set_config('request.jwt.claim.sub',device.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',device.user_id)::text,true);
  result:=public.tag_appearance_settings(case when p_action='tag_save' then p_input else '{}'::jsonb end);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return result;
 end if;
 if p_action='disconnect' then$new$);
 if updated=definition then raise exception 'Review paired tag-appearance dispatch'; end if;
 execute updated;
end;
$migration$;
commit;
