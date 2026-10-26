begin;

-- Dates on the entry describe the current reading session. Keep the previous
-- range in the private timeline before starting another read, including older
-- imported completions whose original start date was unknown.
create or replace function public.track_library_reading() returns trigger
language plpgsql set search_path='' as $$
declare event_action text; starts_session boolean:=false;
begin
 if TG_OP='UPDATE' then
  -- Retain the existing CSV/bookmark historical-date corrections.
  select coalesce(jsonb_agg(case
   when event->>'action'='added' and new.created_at<old.created_at
    then jsonb_set(event,'{at}',to_jsonb(new.created_at))
   when event->>'action'='finished' and new.finished_at<old.finished_at
    and (event->>'at')::timestamptz=old.finished_at
    then jsonb_set(event,'{at}',to_jsonb(new.finished_at))
   else event end order by ordinal),'[]'::jsonb) into new.reading_history
  from jsonb_array_elements(old.reading_history) with ordinality events(event,ordinal);
  if new.reading_status=old.reading_status then return new; end if;
  starts_session:=new.reading_status in ('reading','re_reading') and
   (old.finished_at is not null or (new.reading_status='re_reading'
    and old.reading_status not in ('reading','re_reading','paused_reading')));
 else
  -- Undo and backup restores retain their original dates and timeline.
  if new.reading_history is not null and new.reading_history<>'[]'::jsonb then return new; end if;
  new.reading_history:=jsonb_build_array(jsonb_build_object('action','added','at',new.created_at,'status',new.reading_status));
 end if;
 event_action:=case when new.reading_status='finished' then 'finished'
  when new.reading_status='paused_reading' then 'paused_reading'
  when TG_OP='UPDATE' and old.reading_status='paused_reading' then 'resumed' else 'status' end;
 new.reading_history:=new.reading_history || jsonb_build_array(jsonb_build_object(
  'action',event_action,'at',now(),'status',new.reading_status,
  'previous_status',case when TG_OP='UPDATE' then old.reading_status else null end)
  || case when starts_session then jsonb_build_object(
   'previous_started_at',old.started_at,'previous_finished_at',old.finished_at) else '{}'::jsonb end);
 if starts_session then
  new.started_at:=now();
  new.finished_at:=null;
 end if;
 if new.reading_status='finished' then new.finished_at:=now(); end if;
 if new.reading_status in ('reading','re_reading') then new.started_at:=coalesce(new.started_at,now()); end if;
 return new;
end;
$$;

-- The entry no longer carries the old finish while another read is underway.
-- Chapter observations still need that history to recognize later reread chapters,
-- even when the reader chooses Reading rather than Re-Reading for this session.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.track_chapter_read()'::regprocedure) into definition;
 updated:=replace(definition,'or old.finished_at is not null',
  $hook$or old.finished_at is not null
   or exists(select 1 from jsonb_array_elements(old.reading_history) e
    where e->>'previous_finished_at' is not null)$hook$);
 if updated=definition then raise exception 'Review chapter reread session detection'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
