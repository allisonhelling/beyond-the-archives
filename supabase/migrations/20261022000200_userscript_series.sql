begin;

-- Internal helper runs only after the existing device RPC verifies the paired
-- credential and installs that device owner's identity for this transaction.
create function public.userscript_series(p_action text,p_series bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.library_series; selected jsonb; preview jsonb; entry_id uuid; metadata jsonb;
 collections jsonb; saved_ids jsonb; result jsonb; selected_id bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_series is null or p_series<1 or p_series>9007199254740991 or p_action not in ('series_get','series_save')
  or octet_length(p_input::text)>3000000 then raise exception 'Invalid series request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':series:' || p_series::text,0));
 select * into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series for update;
 if p_action='series_save' then
  if (saved.id is not null and p_input->>'version' is distinct from saved.updated_at::text)
   or (saved.id is null and p_input->>'version' is not null) then
   raise exception 'Series changed. Reload before retrying.' using errcode='40001';
  end if;
  preview:=p_input->'preview';
  if (preview->>'seriesId')::bigint is distinct from p_series or jsonb_typeof(p_input->'works') is distinct from 'array'
   or jsonb_array_length(p_input->'works')>2000 then raise exception 'Invalid selected works' using errcode='22023'; end if;
  -- AO3 paginates series. Keep installments saved from earlier pages.
  if saved.id is not null then
   preview:=jsonb_set(preview,'{works}',coalesce((select jsonb_agg(work order by (work->>'position')::integer nulls last, (work->>'workId')::bigint)
    from (select distinct on (work->>'workId') work from (
     select value work,1 priority from jsonb_array_elements(preview->'works')
     union all select value,2 from jsonb_array_elements(saved.metadata->'works')
    ) parts order by work->>'workId',priority) combined),'[]'::jsonb));
  end if;
  entry_id:=public.remember_library_series(preview || jsonb_build_object('basic',false,'fetchedAt',now()));
  perform public.save_library_series_note(p_series,coalesce(p_input->>'notes',''),coalesce(saved.notes,''));
  perform public.update_library_series(p_series,jsonb_build_object('favorite',coalesce((p_input->>'favorite')::boolean,false),'collections',coalesce(p_input->'collections','[]'::jsonb)),
   jsonb_build_object('favorite',coalesce(saved.is_favorite,false),'collections',coalesce((select jsonb_agg(collection_id) from public.collection_series where library_series_id=entry_id and user_id=auth.uid()),'[]'::jsonb)));
  for selected in select value from jsonb_array_elements(p_input->'works') loop
   selected_id:=(selected->>'workId')::bigint;
   if not exists(select 1 from jsonb_array_elements(preview->'works') w where (w->>'workId')::bigint=selected_id) then raise exception 'Work is not in this series'; end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || selected_id::text,0));
   -- Idempotent retries and concurrently saved works never overwrite progress.
   if exists(select 1 from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=auth.uid() and w.ao3_work_id=selected_id) then continue; end if;
   metadata:=selected->'metadata';
   entry_id:=public.save_library_story('https://archiveofourown.org/works/' || selected_id,metadata,
    (selected->>'status')::public.reading_status,(selected->>'progress')::integer,coalesce(selected->>'notes',''),
    (selected->>'rating')::smallint,false,array(select jsonb_array_elements_text(selected->'collections')::uuid),array(select jsonb_array_elements_text(selected->'tags')),null);
   update public.library_entries set metadata_overrides='{}'::jsonb,extension_metadata=metadata || jsonb_build_object('is_complete',
    case metadata->>'publication_status' when 'complete' then true when 'in_progress' then false else null end) where id=entry_id and user_id=auth.uid();
  end loop;
  select * into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_position,created_at),'[]'::jsonb) into collections
  from public.collections where user_id=auth.uid() and default_key is null and automatic_rules is null;
 select coalesce(jsonb_agg(w.ao3_work_id),'[]'::jsonb) into saved_ids from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=auth.uid();
 if saved.id is not null then
  result:=jsonb_build_object('id',saved.id,'version',saved.updated_at::text,'notes',saved.notes,'favorite',saved.is_favorite,'collections',
   coalesce((select jsonb_agg(collection_id) from public.collection_series where library_series_id=saved.id and user_id=auth.uid()),'[]'::jsonb));
 end if;
 return jsonb_build_object('entry',result,'collections',collections,'savedWorks',saved_ids);
end;
$$;
revoke all on function public.userscript_series(text,bigint,jsonb) from public,anon,authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,$old$ if p_action not in ($old$,$new$ if p_action in ('series_get','series_save') then
  perform set_config('request.jwt.claim.sub',device.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',device.user_id)::text,true);
  result:=public.userscript_series(p_action,p_work,p_input);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return result;
 end if;
 if p_action not in ($new$);
 if updated=definition then raise exception 'Review userscript series dispatch'; end if;
 execute updated;
end;
$migration$;
commit;
