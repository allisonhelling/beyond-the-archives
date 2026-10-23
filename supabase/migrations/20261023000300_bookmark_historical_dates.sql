begin;

-- Both CSV and Safari scans pass through this observation boundary. Keep
-- personal fields while reconciling the historical dates and positive Recs.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, ' update public.library_entries set source_bookmark=source_bookmark||source,', $hook$
 if r->>'source'='bookmarks' and r->>'bookmarkDate' is not null then
  source:=jsonb_set(source,'{date}',to_jsonb(least((r->>'bookmarkDate')::date,(entry.source_bookmark->>'date')::date)::text));
 end if;
 update public.library_entries set source_bookmark=source_bookmark||source,$hook$);
 updated:=replace(updated, ' if created then update', $hook$
 if r->>'source'='bookmarks' then
  with reconciled as (
   select id,
    is_rec or coalesce(r->'bookmarkRec'='true'::jsonb,false) or coalesce(source->'rec'='true'::jsonb,false) as rec,
    least(created_at,(source->>'date')::date::timestamp at time zone 'UTC') as added,
    case when started_at is not null then least(started_at,(source->>'date')::date::timestamp at time zone 'UTC') end as started,
    case when desired<>'deleted' and not (r ? 'importReadingStatus') and (r->>'bookmarkDate')::date>(r->>'updatedDate')::date
     and (r->>'bookmarkDate')::date<=least(entry.created_at::date,coalesce((entry.source_bookmark->>'date')::date,(r->>'bookmarkDate')::date))
     then least(finished_at,(r->>'bookmarkDate')::date::timestamp at time zone 'UTC') else finished_at end as finished
   from public.library_entries where id=entry.id
  )
  update public.library_entries e set is_rec=c.rec,created_at=c.added,started_at=c.started,finished_at=c.finished
   from reconciled c where e.id=c.id
    and (e.is_rec,e.created_at,e.started_at,e.finished_at) is distinct from (c.rec,c.added,c.started,c.finished);
 end if;
 if created then update$hook$);
 if updated=definition or updated not like '%as rec%' then raise exception 'Review historical bookmark reconciliation'; end if;
 execute updated;

 -- An explicit personal-data overwrite still retains an earlier known finish.
 select pg_get_functiondef('public.submit_ao3_csv_works(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $old$then (bookmark::text||'T00:00:00Z')::timestamptz else null end$old$,
  $new$then least(entry.finished_at,(bookmark::text||'T00:00:00Z')::timestamptz) else null end$new$);
 if updated=definition then raise exception 'Review historical finish overwrite'; end if;
 execute updated;

 -- Preserve real reading transitions, correcting the original added/finished
 -- events when an earlier historical timestamp becomes known.
 select pg_get_functiondef('public.track_library_reading()'::regprocedure) into definition;
 updated:=replace(definition, '  new.reading_history:=old.reading_history;', $hook$
  select coalesce(jsonb_agg(case
   when event->>'action'='added' and new.created_at<old.created_at
    then jsonb_set(event,'{at}',to_jsonb(new.created_at))
   when event->>'action'='finished' and new.finished_at<old.finished_at
    and (event->>'at')::timestamptz=old.finished_at
    then jsonb_set(event,'{at}',to_jsonb(new.finished_at))
   else event end order by ordinal),'[]'::jsonb) into new.reading_history
  from jsonb_array_elements(old.reading_history) with ordinality events(event,ordinal);$hook$);
 if updated=definition then raise exception 'Review historical reading timeline'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
