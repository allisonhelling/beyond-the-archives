begin;

-- Keep the single-chapter contract for older companions; new companions may
-- attach observations for earlier chapters completed by the same action.
create or replace function public.validate_chapter_read(p_read jsonb, p_progress jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare captured jsonb; seen integer[]:='{}';
begin
 if jsonb_typeof(p_read) is distinct from 'object'
  or not (p_read ?& array['chapter','chapter_id','word_count'])
  or p_read-'chapter'-'chapter_id'-'word_count'-'previous_chapters'<>'{}'::jsonb
  or jsonb_typeof(p_read->'chapter') is distinct from 'number'
  or (p_read->>'chapter')::numeric<>trunc((p_read->>'chapter')::numeric)
  or (p_read->>'chapter')::numeric not between 1 and 2147483647
  or p_read->'chapter' is distinct from p_progress
  or (p_read->'chapter_id'<>'null'::jsonb and (jsonb_typeof(p_read->'chapter_id')<>'string'
   or (p_read->>'chapter_id')!~'^[1-9][0-9]{0,15}$'))
  or (p_read->'word_count'<>'null'::jsonb and (jsonb_typeof(p_read->'word_count')<>'number'
   or (p_read->>'word_count')::numeric<>trunc((p_read->>'word_count')::numeric)
   or (p_read->>'word_count')::numeric not between 0 and 2147483647)) then
  raise exception 'Invalid chapter read' using errcode='22023';
 end if;
 if p_read ? 'previous_chapters' then
  if jsonb_typeof(p_read->'previous_chapters') is distinct from 'array' then
   raise exception 'Invalid chapter reads' using errcode='22023';
  end if;
  for captured in select value from jsonb_array_elements(p_read->'previous_chapters') loop
   if captured ? 'previous_chapters' then raise exception 'Nested chapter reads' using errcode='22023'; end if;
   perform public.validate_chapter_read(captured,captured->'chapter');
   if (captured->>'chapter')::integer >= (p_read->>'chapter')::integer
    or (captured->>'chapter')::integer = any(seen) then
    raise exception 'Invalid chapter range' using errcode='22023';
   end if;
   seen:=array_append(seen,(captured->>'chapter')::integer);
  end loop;
 end if;
end;
$$;

create or replace function public.track_chapter_read() returns trigger
language plpgsql set search_path='' as $$
declare context jsonb; captured jsonb; reread boolean; snapshot jsonb; last_read jsonb;
 previous_progress integer:=0;
begin
 context:=nullif(current_setting('app.chapter_read',true),'')::jsonb;
 if context is null or context->>'user'<>new.user_id::text
  or not exists(select 1 from public.works w where w.id=new.work_id and w.ao3_work_id=(context->>'work')::bigint) then
  return new;
 end if;
 if context ? 'undo' then
  if TG_OP<>'UPDATE' then raise exception 'No read to undo' using errcode='22023'; end if;
  last_read:=old.reading_history->-1;
  snapshot:=last_read->'undo';
  if last_read->>'action' is distinct from 'chapter_read' or snapshot is null
   or last_read->>'id' is distinct from context->>'undo' then
   raise exception 'Read changed. Reload before retrying Undo.' using errcode='40001';
  end if;
  new.last_read_chapter:=(snapshot->>'progress')::integer;
  new.reading_status:=(snapshot->>'status')::public.reading_status;
  new.started_at:=(snapshot->>'started_at')::timestamptz;
  new.finished_at:=(snapshot->>'finished_at')::timestamptz;
  new.dnf_since:=(snapshot->>'dnf_since')::timestamptz;
  select coalesce(jsonb_agg(e order by n),'[]'::jsonb) into new.reading_history
   from jsonb_array_elements(old.reading_history) with ordinality events(e,n)
   where n<=(snapshot->>'history_length')::integer;
  perform set_config('app.chapter_read','',true);
  return new;
 end if;
 captured:=context->'capture';
 if captured is null then return new; end if;
 if new.last_read_chapter<>(captured->>'chapter')::integer or new.reading_status='to_read'
  or (TG_OP='UPDATE' and old.last_read_chapter>=new.last_read_chapter) then return new; end if;
 if TG_OP='UPDATE' then
  previous_progress:=old.last_read_chapter;
  snapshot:=jsonb_build_object('progress',old.last_read_chapter,'status',old.reading_status,
   'started_at',old.started_at,'finished_at',old.finished_at,'dnf_since',old.dnf_since,
   'history_length',jsonb_array_length(old.reading_history));
 else
  snapshot:=jsonb_build_object('progress',0,'status','to_read','started_at',null,
   'finished_at',null,'dnf_since',null,'history_length',0);
 end if;
 for captured in select value from jsonb_array_elements(
  coalesce(context->'capture'->'previous_chapters','[]'::jsonb) || jsonb_build_array((context->'capture')-'previous_chapters'))
  order by (value->>'chapter')::integer loop
  if (captured->>'chapter')::integer<=previous_progress then continue; end if;
  reread:=new.reading_status='re_reading';
  if TG_OP='UPDATE' then
   reread:=reread or old.reading_status='re_reading' or old.finished_at is not null
    or exists(select 1 from jsonb_array_elements(old.reading_history) e where e->>'previous_finished_at' is not null)
    or exists(select 1 from jsonb_array_elements(old.reading_history) e
     where e->>'action'='chapter_read' and e->'chapter'=captured->'chapter')
    or (old.reading_status='paused_reading' and coalesce((select e->>'previous_status'
     from jsonb_array_elements(old.reading_history) with ordinality events(e,n)
     where e->>'action'='paused_reading' order by n desc limit 1),'')='re_reading');
  end if;
  new.reading_history:=new.reading_history || jsonb_build_array(captured || jsonb_build_object(
   'id',gen_random_uuid(),'action','chapter_read','at',statement_timestamp(),
   'status',new.reading_status,'is_reread',reread) || case when (captured->>'chapter')::integer=new.last_read_chapter
    then jsonb_build_object('undo',snapshot) else '{}'::jsonb end);
 end loop;
 perform set_config('app.chapter_read','',true);
 return new;
end;
$$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_input ? 'chapter_read' then$old$,$new$
 if p_input ? 'undo_read' then
  -- Undo uses the strict version guard, never the field merge path. The trigger
  -- restores only a server-created snapshot belonging to the latest read.
  if p_action<>'progress' or p_input ? 'base' or p_input ? 'chapter_read'
   or jsonb_typeof(p_input->'undo_read') is distinct from 'string' then
   raise exception 'Invalid read undo' using errcode='22023';
  end if;
  perform set_config('app.chapter_read',jsonb_build_object('user',device.user_id,'work',p_work,'undo',p_input->>'undo_read')::text,true);
 end if;
 if p_input ? 'chapter_read' then$new$);
 if updated=definition then raise exception 'Review companion read undo boundary'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
