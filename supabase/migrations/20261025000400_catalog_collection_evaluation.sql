begin;

-- Reuse the shared matching expressions, but let PL/pgSQL cache their statement
-- plans across work/rule pairs. The SQL functions previously replanned their
-- nested predicates on each call. Keep signatures, grants and invoker security.
do $$ declare signature regprocedure; definition text; expression text; updated text; begin
 foreach signature in array array[
  'public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure,
  'public.automatic_collection_matches(jsonb,jsonb)'::regprocedure,
  'public.automatic_collection_ids(jsonb,uuid)'::regprocedure] loop
  select pg_get_functiondef(signature),prosrc into definition,expression from pg_proc where oid=signature;
  updated:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
  updated:=replace(updated,expression,E'begin\n return (' || regexp_replace(trim(expression),';\s*$','') || E');\nend;\n');
  if updated=definition or updated not like '%LANGUAGE plpgsql%' then
   raise exception 'Review automatic collection plan caching: %',signature;
  end if;
  execute updated;
 end loop;
end $$;

-- Expanding library_collection_documents.story for every compact field repeats
-- the JSON concatenation and membership query. Read the stored document and
-- evaluate memberships only for the single output field that needs them.
-- Preserve the established catalog contract, Rec fields, and owner/RLS checks.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_catalog()'::regprocedure) into definition;
 updated:=replace(definition,'from public.library_collection_documents','from public.library_search_documents');
 updated:=replace(updated,$old$story->'automaticCollectionIds'$old$,
  $new$public.automatic_collection_ids(story,user_id)$new$);
 if updated=definition or updated like '%public.library_collection_documents%'
  or updated not like '%public.automatic_collection_ids(story,user_id)%' then
  raise exception 'Review compact catalog collection evaluation';
 end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
