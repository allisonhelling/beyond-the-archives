-- Make the existing text-to-enum assignment explicit for PostgreSQL function checks.
begin;
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$v_category:=case k when 'relationship_tags' then 'relationship' when 'character_tags' then 'character' when 'additional_tags' then 'freeform' when 'archive_warnings' then 'warning' else 'category' end;$old$,
  $new$v_category:=(case k when 'relationship_tags' then 'relationship' when 'character_tags' then 'character' when 'additional_tags' then 'freeform' when 'archive_warnings' then 'warning' else 'category' end)::public.ao3_tag_category;$new$);
 if updated=definition then raise exception 'Tag category assignment changed; review migration'; end if;
 execute updated;
end $migration$;
commit;
