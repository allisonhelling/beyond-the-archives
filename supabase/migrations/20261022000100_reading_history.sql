begin;

alter table public.library_entries add column reading_history jsonb not null default '[]'::jsonb check (jsonb_typeof(reading_history)='array');

-- Existing unknown finish/pause dates cannot be reconstructed. Begin the timeline
-- now without manufacturing a historical finish date or pause duration.
alter table public.library_entries disable trigger set_updated_at;
update public.library_entries set reading_history=jsonb_build_array(jsonb_build_object('action','added','at',now(),'status',reading_status));
alter table public.library_entries enable trigger set_updated_at;

create function public.track_library_reading() returns trigger
language plpgsql set search_path='' as $$
declare event_action text;
begin
 if TG_OP='UPDATE' then
  new.reading_history:=old.reading_history;
  if new.reading_status=old.reading_status then return new; end if;
 else
  -- Undo restores the original timeline and timestamps verbatim.
  if new.reading_history is not null and new.reading_history<>'[]'::jsonb then return new; end if;
  new.reading_history:=jsonb_build_array(jsonb_build_object('action','added','at',new.created_at,'status',new.reading_status));
 end if;
 event_action:=case when new.reading_status='finished' then 'finished'
  when new.reading_status='paused_reading' then 'paused_reading'
  when TG_OP='UPDATE' and old.reading_status='paused_reading' then 'resumed' else 'status' end;
 new.reading_history:=new.reading_history || jsonb_build_array(jsonb_build_object('action',event_action,'at',now(),'status',new.reading_status,'previous_status',case when TG_OP='UPDATE' then old.reading_status else null end));
 if new.reading_status='finished' then new.finished_at:=now(); end if;
 if new.reading_status in ('reading','re_reading') then new.started_at:=coalesce(new.started_at,now()); end if;
 return new;
end;
$$;
revoke all on function public.track_library_reading() from public,anon,authenticated;
-- Run after existing progress/status normalization and before projection sync.
create trigger zz_track_library_reading before insert or update on public.library_entries for each row execute function public.track_library_reading();

-- Shared server shelf matching and search labels mirror the client.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 definition:=replace(definition,$$when 'complete' then$$,$$when 're_reading' then s->>'reading_status'='re_reading' when 'complete' then$$);
 definition:=replace(definition,$$when 'finished' then s->>'reading_status'='finished'$$,$$when 'finished' then s->>'reading_status' in ('finished','re_reading')$$);
 execute definition;
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 definition:=replace(definition,$$'complete','in_progress','new','view_all'$$,$$'complete','in_progress','new','re_reading','view_all'$$);
 execute definition;
 select pg_get_functiondef('public.library_search_text(jsonb,text)'::regprocedure) into definition;
 execute replace(definition,'Re-reading','Re-Reading');
end;
$migration$;

-- Version 1 backups predate the timeline column. The shared restore engine
-- fills only a missing timeline; all recorded dates remain untouched.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,$old$  -- Expired worker credentials$old$,$new$  if t='library_entries' then
   select coalesce(jsonb_agg(jsonb_set(r,'{reading_history}',coalesce(nullif(r->'reading_history','null'::jsonb),'[]'::jsonb))),'[]'::jsonb) into rows from jsonb_array_elements(rows) r;
  end if;
  -- Expired worker credentials$new$);
 if updated=definition then raise exception 'Review reading history backup compatibility'; end if;
 execute updated;
end;
$migration$;

-- Refresh full documents so the new column is available in paginated results.
select public.refresh_library_documents(array(select id from public.library_entries));
commit;
