begin;

-- Every entry write must obtain an explicit chapter choice before changing a
-- manually Finished story's published count. Source observations may still
-- refresh without changing a manual override. The checked editor already sets
-- the choice after its snapshot checks; direct and older clients must retry
-- through that editor instead of bypassing the review.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.review_chapter_total()'::regprocedure) into definition;
 updated:=replace(definition,
  $old$and old.reading_status='finished' and origin is distinct from 'derived'
    and current_setting('app.chapter_edit',true)='true' then$old$,
  $new$and old.reading_status='finished' and origin is distinct from 'derived'
    and (current_setting('app.chapter_edit',true)='true'
      or new.metadata_overrides->'published_chapters' is distinct from old.metadata_overrides->'published_chapters'
      or old_published is not null and (new.last_read_chapter,new.reading_status) is distinct from (old.last_read_chapter,old.reading_status)) then$new$);
 if updated=definition then raise exception 'Review Finished chapter guard definition'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
