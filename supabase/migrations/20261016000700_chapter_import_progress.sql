begin;

-- Browser metadata checks are not personal edits. Keep the existing timestamp
-- guard usable when a newly imported chapter is verified by the extension.
drop trigger set_updated_at on public.library_entries;
create trigger set_updated_at before update on public.library_entries
 for each row when (
  (to_jsonb(old) - 'extension_metadata' - 'extension_chapters') is distinct from
  (to_jsonb(new) - 'extension_metadata' - 'extension_chapters')
 ) execute function public.set_updated_at();

-- Verify chapter positions and infer initial progress once for both retrieval
-- modes, before browser snapshots update the entry. The existing ownership,
-- lease, cancellation and personal-edit guards still apply.
do $$ declare definition text; updated text; progress text:=$progress$  for item in select * from public.import_items where batch_id=j.batch_id and ao3_work_id=wid loop
   pos:=null;
   if item.chapter_id is not null then select key::integer into pos from jsonb_each_text(p_chapters) where value=item.chapter_id limit 1; end if;
   update public.import_items set verified_position=pos where id=item.id;
  end loop;
  select max(verified_position)-1 into best from public.import_items where batch_id=j.batch_id and ao3_work_id=wid;
  if j.created_entry and best>0 then
   -- Do not change progress if the user edited the entry while retrieval was pending.
   update public.library_entries set last_read_chapter=best,reading_status='reading'
    where id=j.entry_id and user_id=j.user_id and reading_status='to_read' and last_read_chapter=0 and updated_at=created_at;
  end if;$progress$; begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, progress, '');
 updated:=replace(updated, $old$ if p_metadata is not null and j.retrieval_mode='extension' then
  update public.import_items i set verified_position=(select key::integer from jsonb_each_text(p_chapters) where value=i.chapter_id limit 1)
   where i.batch_id=j.batch_id and i.ao3_work_id=wid;
  -- A page visit never sets reading progress, including a chapter import.
 elsif p_metadata is not null then$old$, $new$ if p_metadata is not null and j.retrieval_mode='direct' then$new$);
 updated:=replace(updated, $old$ if p_metadata is not null and (j.retrieval_mode=$old$,
  E' if p_metadata is not null then\n' || progress || E'\n end if;\n if p_metadata is not null and (j.retrieval_mode=');
 if updated=definition or updated like '%A page visit never sets reading progress%' or updated not like '%if p_metadata is not null then%for item in select * from public.import_items%' then
  raise exception 'Review shared chapter import progress';
 end if;
 execute updated;
end $$;
commit;
