begin;

-- Archive the observed bookmark fields separately from personal edits. A
-- deleted listing never supplies replacement metadata for a saved work.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '''date'',r->>''bookmarkDate''', $fields$'date',r->>'bookmarkDate',
  'user',nullif(r->>'bookmarkUser',''),
  'count',case when r->>'bookmarkCount' ~ '^[0-9]{1,10}$' and (r->>'bookmarkCount')::bigint<=2147483647 then (r->>'bookmarkCount')::bigint end,
  'notes',r->'notes','tags',r->'tags'$fields$);
 if updated=definition then raise exception 'Review bookmark source fields'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
