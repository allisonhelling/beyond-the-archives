begin;

-- Extend existing account-backed tag appearance and companion sync.
create or replace function public.tag_appearance_settings(p_input jsonb default '{}'::jsonb)
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
   or next_value - 'shape' - 'colors' - 'order' <> '{}'::jsonb then
   raise exception 'Invalid tag appearance' using errcode='22023';
  end if;
  for item in select * from jsonb_each(next_value->'colors') loop
   if item.key not in ('relationships','characters','tags','warnings','collections','personalTags')
    or jsonb_typeof(item.value) is distinct from 'string' or (item.value #>> '{}') !~ '^#[a-fA-F0-9]{6}$' then
    raise exception 'Invalid tag color' using errcode='22023';
   end if;
  end loop;
  if next_value ? 'order' then
   if jsonb_typeof(next_value->'order') is distinct from 'array' then raise exception 'Invalid tag category order' using errcode='22023'; end if;
   if jsonb_array_length(next_value->'order')<>5 or
    (select count(distinct value) from jsonb_array_elements_text(next_value->'order'))<>5 or
    exists(select 1 from jsonb_array_elements_text(next_value->'order') value where value not in ('tags','relationships','characters','categories','warnings')) then
    raise exception 'Invalid tag category order' using errcode='22023';
   end if;
  elsif saved ? 'order' then
   -- Older clients can change shape/colors without erasing a newer category order.
   next_value:=next_value||jsonb_build_object('order',saved->'order');
  end if;
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

commit;
