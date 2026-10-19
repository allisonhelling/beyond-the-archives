-- Abandonment is a private publication override, independent of reading status.
-- Extend the existing validator so saves, progress edits, and browser updates agree.
do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.validate_manual_entry()'::regprocedure) into definition;
  updated := replace(definition, '(''unknown'',''in_progress'',''complete'')', '(''unknown'',''in_progress'',''complete'',''abandoned'')');
  updated := replace(updated, '  return new;', $replacement$
  if m->>'publication_status' = 'abandoned' then
    declare effective jsonb; published_count integer;
    begin
      select jsonb_build_object('published_chapters', w.published_chapters)
        || w.automatic_metadata || new.extension_metadata || m
        into effective from public.works w where w.id = new.work_id;
      published_count := (effective->>'published_chapters')::integer;
      if published_count > 0 and new.last_read_chapter >= published_count then
        new.reading_status := 'finished';
      end if;
    end;
  end if;
  return new;$replacement$);
  if updated = definition or position('published_count' in updated) = 0 or position('''abandoned'')' in updated) = 0 then
    raise exception 'Could not extend manual entry validation';
  end if;
  execute updated;
end;
$$;
