begin;

-- Browser/list imports keep chapter-date maps in effective metadata. The series
-- merger consumes chapter counts but never those per-chapter dates. Exclude the
-- maps at the existing stored projection, before aggregating/copying works into
-- every inferred or saved series. Full work documents and reading history keep
-- their dates; series matching, cards, ownership and cache invalidation are shared.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_input(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$(s->'metadata')-'summary_html'$old$,
  $new$(s->'metadata')-'summary_html'-'chapter_dates'$new$);
 if updated=definition then raise exception 'Review series metadata projection'; end if;
 execute updated;
end $$;

-- Changing an immutable projector does not recompute existing stored values.
-- Assign its source column to itself to rebuild generated inputs for saved works.
update public.library_search_documents set story=story
 where series_story->'metadata' ? 'chapter_dates';
notify pgrst,'reload schema';
commit;
