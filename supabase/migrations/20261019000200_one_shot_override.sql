begin;

-- One-shot corrections use the existing private metadata layer and reset action.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated := replace(definition, '  return new;', $validation$
  if m ? 'one_shot' and jsonb_typeof(m->'one_shot') <> 'boolean' then
    raise exception 'Expected a boolean one-shot label' using errcode='22023';
  end if;
  return new;$validation$);
 if updated=definition then raise exception 'Review one-shot override validation'; end if;
 execute updated;

 select pg_get_functiondef('public.clear_metadata_override(uuid,text)'::regprocedure) into definition;
 updated := replace(definition, '(''title'',''summary''', '(''one_shot'',''title'',''summary''');
 if updated=definition then raise exception 'Review one-shot override reset'; end if;
 execute updated;
end;
$$;

commit;
