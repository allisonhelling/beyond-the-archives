begin;

-- Keep account preferences in the existing owner-scoped row and backup stream.
alter table public.metadata_preferences add column personal_rating_info text
 check (personal_rating_info is null or length(personal_rating_info)<=10000);

create function public.personal_rating_settings(p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); saved text;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- Lock even before a preferences row exists, so first writes cannot race.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':rating-info',0));
 select personal_rating_info into saved from public.metadata_preferences where user_id=owner_id;
 if p_input ? 'text' then
  if jsonb_typeof(p_input->'text') is distinct from 'string' or length(p_input->>'text')>10000 or not (p_input ? 'base') then
   raise exception 'Invalid personal rating explanation' using errcode='22023';
  end if;
  if (p_input->>'base') is distinct from saved and (p_input->>'text') is distinct from saved then
   raise exception 'Rating explanation changed on another device. Reload before saving.' using errcode='40001';
  end if;
  insert into public.metadata_preferences(user_id,personal_rating_info) values(owner_id,p_input->>'text')
   on conflict(user_id) do update set personal_rating_info=excluded.personal_rating_info;
  saved:=p_input->>'text';
 end if;
 return jsonb_build_object('ratingInfo',saved);
end;
$$;
revoke all on function public.personal_rating_settings(jsonb) from public,anon;
grant execute on function public.personal_rating_settings(jsonb) to authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 -- Dispatch only after the existing credential/expiry/paired-device checks.
 updated:=replace(definition,$old$ if p_action='disconnect' then$old$,$new$ if p_action in ('rating_get','rating_save') then
  perform set_config('request.jwt.claim.sub',device.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',device.user_id)::text,true);
  result:=public.personal_rating_settings(case when p_action='rating_save' then p_input else '{}'::jsonb end);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return result;
 end if;
 if p_action='disconnect' then$new$);
 if updated=definition then raise exception 'Review personal rating device dispatch'; end if;
 updated:=replace(updated,$old$return jsonb_build_object('entry',result,'collections',$old$,$new$return jsonb_build_object('ratingInfo',(select personal_rating_info from public.metadata_preferences where user_id=device.user_id),'entry',result,'collections',$new$);
 if updated not like '%''ratingInfo'',(select personal_rating_info%' then raise exception 'Review personal rating work response'; end if;
 updated:=replace(updated,$old$result:=public.userscript_series(p_action,p_work,p_input);$old$,$new$result:=public.userscript_series(p_action,p_work,p_input) || public.personal_rating_settings();$new$);
 -- Return history so the Chrome resume button can restore a paused re-read.
 updated:=replace(updated,$old$'progress',entry.last_read_chapter,'notes',entry.notes$old$,$new$'progress',entry.last_read_chapter,'readingHistory',entry.reading_history,'notes',entry.notes$new$);
 if updated not like '%''readingHistory'',entry.reading_history%' then raise exception 'Review companion reading history response'; end if;
 execute updated;
end;
$migration$;

-- Manual add/edit uses the existing merge boundary, including its Rec conflict checks.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.save_library_story_checked(uuid,text,jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'declare saved jsonb;', 'declare saved_id uuid; saved jsonb;');
 updated:=replace(updated,$old$ return public.save_library_story($old$,$new$ if p_input ? 'rec' and jsonb_typeof(p_input->'rec') is distinct from 'boolean' then raise exception 'Invalid Rec status' using errcode='22023'; end if;
 saved_id:=public.save_library_story($new$);
 updated:=replace(updated,$old$,p_id);
end;$old$,$new$,p_id);
 if p_input ? 'rec' then update public.library_entries set is_rec=(edits->>'rec')::boolean where id=saved_id and user_id=auth.uid(); end if;
 return saved_id;
end;$new$);
 if updated=definition or updated not like '%return saved_id;%' then raise exception 'Review manual Rec saving'; end if;
 execute updated;
end;
$migration$;
-- A paused work may still have an unread update, but belongs only in Paused Reading.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 updated:=replace(definition,$old$when 'new' then $old$,$new$when 'new' then s->>'reading_status'<>'paused_reading' and $new$);
 if updated=definition then raise exception 'Review paused chapter-update shelf'; end if;
 execute updated;
end;
$migration$;
notify pgrst,'reload schema';
commit;
