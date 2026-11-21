begin;

-- Extend the checked preference document without replacing the existing RPC contract.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.tag_appearance_settings(jsonb)'::regprocedure) into definition;
 updated := replace(definition, $keys$ - 'allColor' <> '{}'::jsonb$keys$, $keys$ - 'allColor' - 'fandom' <> '{}'::jsonb$keys$);
 if updated=definition then raise exception 'Review the allowed tag appearance keys'; end if;
 definition := updated;
 updated := replace(definition, $marker$  for item in select * from jsonb_each(next_value->'colors') loop$marker$, $fandom$  if next_value ? 'fandom' then
   if jsonb_typeof(next_value->'fandom') is distinct from 'object'
    or (next_value->'fandom') - 'shape' - 'textColor' - 'color' <> '{}'::jsonb
    or jsonb_typeof(next_value->'fandom'->'shape') is distinct from 'string'
    or next_value->'fandom'->>'shape' not in ('filled','pill','curved','sharp','bullets','commas')
    or jsonb_typeof(next_value->'fandom'->'textColor') is distinct from 'string'
    or next_value->'fandom'->>'textColor' not in ('colored','black')
    or jsonb_typeof(next_value->'fandom'->'color') is distinct from 'string'
    or next_value->'fandom'->>'color' !~ '^#[a-fA-F0-9]{6}$' then
     raise exception 'Invalid fandom tag appearance' using errcode='22023';
   end if;
  elsif saved ? 'fandom' then
   next_value:=next_value||jsonb_build_object('fandom',saved->'fandom');
  end if;
  for item in select * from jsonb_each(next_value->'colors') loop$fandom$);
 if updated=definition then raise exception 'Review the tag appearance validation'; end if;
 execute updated;
end;
$$;

commit;
