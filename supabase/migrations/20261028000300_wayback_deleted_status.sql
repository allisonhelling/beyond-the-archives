begin;

-- Use the existing entry validation trigger for manual saves, link imports,
-- restores and later metadata writes. Availability remains private to the reader.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
 updated:=replace(definition,'return new;',
 $new$if trim(new.original_url) like 'https://web.archive.org/web/%'
   and public.ao3_source_target(new.original_url) not in ('',trim(new.original_url)) then
   new.work_status:='deleted';
  end if;
  return new;$new$);
 if updated=definition then raise exception 'Review archived entry availability'; end if;
 execute updated;

 -- Existing entries retain their original live URL. Mark them from the submitted
 -- archived item as well, without changing progress, metadata or personal fields.
 select pg_get_functiondef('public.submit_import_urls(text[],boolean,public.reading_status,bigint[])'::regprocedure) into definition;
 updated:=replace(definition,
 $old$if entry_uuid is null then select id into entry_uuid from public.library_entries where user_id=owner_id and work_id=work_uuid; end if;$old$,
 $new$if entry_uuid is null then select id into entry_uuid from public.library_entries where user_id=owner_id and work_id=work_uuid; end if;
  if public.ao3_source_target(original)<>trim(original) then
   update public.library_entries set work_status='deleted' where id=entry_uuid and user_id=owner_id and work_status<>'deleted';
  end if;$new$);
 if updated=definition then raise exception 'Review archived import availability'; end if;
 execute updated;
 -- A deleted archived work need not have an AO3 bookmark ID. Keep the usual
 -- work-identity placeholder until its snapshot supplies a title.
 select pg_get_viewdef('public.library_story_documents'::regclass,true) into definition;
 updated:=replace(definition,
  $old$base.ao3_work_id IS NULL OR e.work_status = 'deleted'::text$old$,
  $new$base.ao3_work_id IS NULL OR (e.work_status = 'deleted'::text AND e.source_bookmark ? 'id'::text)$new$);
 if updated=definition then raise exception 'Review archived title placeholder'; end if;
 execute 'create or replace view public.library_story_documents with (security_invoker=true) as '||updated;
end $$;

update public.library_entries set work_status='deleted'
where work_status<>'deleted' and trim(original_url) like 'https://web.archive.org/web/%'
 and public.ao3_source_target(original_url) not in ('',trim(original_url));
notify pgrst,'reload schema';
commit;
