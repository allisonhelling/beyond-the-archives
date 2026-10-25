begin;

-- Chapter reads live in the existing private timeline, so library exports,
-- restores, and archived reading records retain them without a second store.
create function public.validate_chapter_read(p_read jsonb, p_progress jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_read) is distinct from 'object' then
  raise exception 'Invalid chapter read' using errcode='22023';
 end if;
 if (select count(*) from jsonb_object_keys(p_read))<>3
  or not (p_read ?& array['chapter','chapter_id','word_count'])
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
end;
$$;
revoke all on function public.validate_chapter_read(jsonb,jsonb) from public,anon,authenticated;

create function public.track_chapter_read() returns trigger
language plpgsql set search_path='' as $$
declare context jsonb; captured jsonb; reread boolean:=false;
begin
 context:=nullif(current_setting('app.chapter_read',true),'')::jsonb;
 if context is null or context->>'user'<>new.user_id::text
  or not exists(select 1 from public.works w where w.id=new.work_id and w.ao3_work_id=(context->>'work')::bigint) then
  return new;
 end if;
 captured:=context->'capture';
 -- Only record a newly completed, explicitly selected chapter. A progress jump
 -- does not manufacture reads/counts for the intervening chapters. Retrying an
 -- already committed save cannot append a duplicate event.
 if new.last_read_chapter<>(captured->>'chapter')::integer
  or new.reading_status='to_read'
  or (TG_OP='UPDATE' and old.last_read_chapter>=new.last_read_chapter) then return new; end if;
 if TG_OP='UPDATE' then
  reread:=old.reading_status='re_reading' or old.finished_at is not null
   or exists(select 1 from jsonb_array_elements(old.reading_history) e
    where e->>'action'='chapter_read' and e->'chapter'=captured->'chapter')
   or (old.reading_status='paused_reading' and coalesce((select e->>'previous_status'
    from jsonb_array_elements(old.reading_history) with ordinality events(e,n)
    where e->>'action'='paused_reading' order by n desc limit 1),'')='re_reading');
 end if;
 new.reading_history:=new.reading_history || jsonb_build_array(captured || jsonb_build_object(
  'id',gen_random_uuid(),'action','chapter_read','at',statement_timestamp(),
  'status',new.reading_status,'is_reread',reread or new.reading_status='re_reading'));
 perform set_config('app.chapter_read','',true);
 return new;
end;
$$;
revoke all on function public.track_chapter_read() from public,anon,authenticated;
-- Run after the existing timeline trigger preserves status transitions.
create trigger zzz_track_chapter_read before insert or update on public.library_entries
 for each row execute function public.track_chapter_read();

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $old$ if p_action in ('save','progress','refresh_metadata') then$old$, $new$
 perform set_config('app.chapter_read','',true);
 if p_input ? 'chapter_read' then
  if p_action not in ('save','progress') then raise exception 'Invalid chapter read action' using errcode='22023'; end if;
  perform public.validate_chapter_read(p_input->'chapter_read',p_input->'progress');
  perform set_config('app.chapter_read',jsonb_build_object('user',device.user_id,'work',p_work,'capture',p_input->'chapter_read')::text,true);
 end if;
 if p_action in ('save','progress','refresh_metadata') then$new$);
 -- A capture is an observation, never an editable personal field or conflict.
 updated:=replace(updated, $old$p_input-'base'-'metadata'-'version'$old$, $new$p_input-'base'-'metadata'-'version'-'chapter_read'$new$);
 updated:=replace(updated, $old$ return jsonb_build_object('entry',result,$old$, $new$ perform set_config('app.chapter_read','',true);
 return jsonb_build_object('entry',result,$new$);
 if updated=definition or updated not like '%perform public.validate_chapter_read%'
  or updated not like '%''version''-''chapter_read''%' then
  raise exception 'Review companion chapter read boundary';
 end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
