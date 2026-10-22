begin;
-- A bookmark can survive without any AO3 work identity. Never invent a work ID.
alter table public.works alter column ao3_work_id drop not null;
alter table public.library_entries
 add column work_status text not null default 'unknown' check(work_status in ('unknown','available','deleted')),
 add column source_bookmark jsonb not null default '{}' check(jsonb_typeof(source_bookmark)='object');
create unique index library_bookmark_identity on public.library_entries(user_id,(source_bookmark->>'id')) where source_bookmark ? 'id';

-- Existing private entries may be edited at their own bookmark URL. URL imports
-- still require work URLs; this exception cannot create a new bookmark entry.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
 updated:=replace(definition,'then
    raise exception ''Enter a supported AO3 work URL''', $hook$and not (p_id is not null and exists(select 1 from public.library_entries e join public.works w on w.id=e.work_id where e.id=p_id and e.user_id=owner_id and w.ao3_work_id is null and e.original_url=p_url and p_url='https://archiveofourown.org/bookmarks/'||(e.source_bookmark->>'id'))) then
    raise exception 'Enter a supported AO3 work URL'$hook$);
 updated:=replace(updated,'and w.ao3_work_id=work_key for update of e;', 'and (w.ao3_work_id=work_key or (work_key is null and w.ao3_work_id is null and e.original_url=p_url)) for update of e;');
 if updated=definition then raise exception 'Review bookmark edit boundary'; end if;
 execute updated;
 -- Reuse the private projection, including source identity, for all library views.
 select pg_get_viewdef('public.library_story_documents'::regclass,true) into definition;
 updated:=replace(definition,'''AO3 work ''::text || base.ao3_work_id', 'case when base.ao3_work_id is null or e.work_status=''deleted'' then ''Deleted Work — Bookmark #''::text || (e.source_bookmark->>''id'') else ''AO3 work ''::text || base.ao3_work_id end');
 if updated=definition then raise exception 'Review deleted title projection'; end if;
 execute 'create or replace view public.library_story_documents with (security_invoker=true) as '||updated;

 select pg_get_functiondef('public.preview_ao3_csv_import(bigint[])'::regprocedure) into definition;
 updated:=replace(definition,'preview_ao3_csv_import(p_work_ids bigint[])','preview_ao3_csv_import(p_work_ids bigint[], p_bookmark_ids bigint[] default ''{}'')');
 updated:=replace(updated,'''workId'',w.ao3_work_id,','''workId'',w.ao3_work_id,''bookmarkId'',(e.source_bookmark->>''id'')::bigint,');
 updated:=replace(updated,'w.ao3_work_id=any(p_work_ids)', '(w.ao3_work_id=any(p_work_ids) or (e.source_bookmark->>''id'')::bigint=any(p_bookmark_ids))');
 updated:=replace(updated,'coalesce(e.metadata_overrides->>''title'',e.extension_metadata->>''title'',w.title)', 'coalesce(e.metadata_overrides->>''title'',e.extension_metadata->>''title'',w.title,''Deleted Work — Bookmark #''||(e.source_bookmark->>''id''))');
 if updated=definition or updated not like '%p_bookmark_ids bigint[]%' then raise exception 'Review bookmark preview'; end if;
 drop function public.preview_ao3_csv_import(bigint[]);
 execute updated;
end $$;

-- Apply only explicit observations to an owner-scoped entry. No missing-list
-- reconciliation exists here: absence is never evidence of deletion.
create function public.apply_ao3_bookmark_observation(r jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); entry public.library_entries; wid bigint; bid bigint; work_uuid uuid; created boolean:=false;
 source jsonb; collections uuid[]; desired text:=coalesce(r->>'workStatus','available'); tags text[];
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 wid:=(r->>'workId')::bigint; bid:=(r->>'bookmarkId')::bigint;
 if desired not in ('available','deleted') or wid is not null and (wid<1 or wid>9007199254740991)
  or bid is not null and (bid<1 or bid>9007199254740991)
  or desired='deleted' and (r->>'source' is distinct from 'bookmarks' or bid is null)
  or r->>'url' is distinct from (case when wid is not null then 'https://archiveofourown.org/works/'||wid else 'https://archiveofourown.org/bookmarks/'||bid end) then raise exception 'Invalid bookmark observation'; end if;
 if bid is not null then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':bookmark:'||bid,0));
  select * into entry from public.library_entries where user_id=owner_id and source_bookmark->>'id'=bid::text for update;
 end if;
 if entry.id is null and wid is not null then
  select e.* into entry from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=owner_id and w.ao3_work_id=wid for update of e;
 end if;
 if entry.id is not null and wid is not null and exists(select 1 from public.works where id=entry.work_id and ao3_work_id is not null and ao3_work_id<>wid) then raise exception 'Bookmark work identity changed'; end if;
 if entry.id is not null and desired='deleted' and r->>'choice'='overwrite' then
  if r->>'expectedVersion' is null or entry.updated_at is distinct from (r->>'expectedVersion')::timestamptz then raise exception 'CSV conflicts changed' using errcode='40001'; end if;
  select coalesce(array_agg(c.collection_id),'{}') into collections from public.collection_works c join public.collections co on co.id=c.collection_id where c.library_entry_id=entry.id and co.default_key is null;
  tags:=array(select jsonb_array_elements_text(coalesce(r->'tags','[]')));
  perform public.save_library_story(entry.original_url,'{}',entry.reading_status,entry.last_read_chapter,coalesce(r->>'notes',''),entry.personal_rating,entry.is_favorite,collections,tags,entry.id);
 end if;
 if entry.id is null then
  if desired<>'deleted' then return false; end if; -- Normal creation uses the CSV importer.
  if wid is null then insert into public.works default values returning id into work_uuid;
  else
   insert into public.works(ao3_work_id) values(wid) on conflict do nothing;
   select id into work_uuid from public.works where ao3_work_id=wid;
  end if;
  insert into public.library_entries(user_id,work_id,original_url,work_status,source_bookmark,extension_metadata,reading_status)
   values(owner_id,work_uuid,r->>'url','deleted',jsonb_build_object('id',bid::text),public.nonempty_ao3_metadata(coalesce(r->'metadata','{}')), 'reading') returning * into entry;
  tags:=array(select jsonb_array_elements_text(coalesce(r->'tags','[]')));
  perform public.save_library_story(entry.original_url,'{}','reading',0,coalesce(r->>'notes',''),null,false,'{}',tags,entry.id);
  created:=true;
 elsif wid is not null and exists(select 1 from public.works where id=entry.work_id and ao3_work_id is null) then
  insert into public.works(ao3_work_id) values(wid) on conflict do nothing;
  select id into work_uuid from public.works where ao3_work_id=wid;
  -- A later explicit work identity upgrades a bookmark-only stub in place.
  update public.library_entries set work_id=work_uuid,original_url=r->>'url' where id=entry.id;
 end if;
 source:=case when bid is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('id',bid::text,'url','https://archiveofourown.org/bookmarks/'||bid,'status',nullif(r->>'bookmarkStatus',''),'date',r->>'bookmarkDate')) end;
 update public.library_entries set source_bookmark=source_bookmark||source,
  work_status=case when desired='deleted' and not created and (coalesce(r->>'scanMode','full')='quick' or r->>'updateDeleted'='false') then work_status else desired end
  where id=entry.id and (source_bookmark is distinct from source_bookmark||source or work_status is distinct from
   case when desired='deleted' and not created and (coalesce(r->>'scanMode','full')='quick' or r->>'updateDeleted'='false') then work_status else desired end);
 return created or (desired='deleted' and coalesce(r->>'choice'='overwrite',false));
end $$;
revoke all on function public.apply_ao3_bookmark_observation(jsonb) from public,anon,authenticated;

-- Keep one existing importer for normal work validation, bookmark choices,
-- metadata jobs, and historical progress. Deleted entries never request a work page.
alter function public.submit_ao3_csv_import(jsonb) rename to submit_ao3_csv_works;
revoke all on function public.submit_ao3_csv_works(jsonb) from public,anon,authenticated;
create function public.submit_ao3_csv_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; normal jsonb; result jsonb; added integer:=0; kept integer:=0; batch uuid; entry_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>20000000 then raise exception 'Submit 1–2000 listing works'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) item where item->>'workStatus' is not null and item->>'workStatus' not in ('available','deleted')) then raise exception 'Invalid work status'; end if;
 if (select count(*)<>count(distinct coalesce('work:'||(value->>'workId'),'bookmark:'||(value->>'bookmarkId'))) from jsonb_array_elements(p_rows)) then raise exception 'Duplicate listing works'; end if;
 -- Resolve a known bookmark-only entry before the work importer decides whether
 -- to create a new library entry. Normal rows retain its original private data.
 for r in select value from jsonb_array_elements(p_rows) where coalesce(value->>'workStatus','available')='available' and value->>'bookmarkId' is not null order by (value->>'workId')::bigint loop
  if exists(select 1 from public.library_entries e join public.works w on w.id=e.work_id where e.user_id=auth.uid() and e.source_bookmark->>'id'=r->>'bookmarkId' and w.ao3_work_id is null) then perform public.apply_ao3_bookmark_observation(r); end if;
 end loop;
 select jsonb_agg(value) into normal from jsonb_array_elements(p_rows) where coalesce(value->>'workStatus','available')='available';
 if normal is not null then result:=public.submit_ao3_csv_works(normal); else result:=jsonb_build_object('batch',null,'imported',0,'kept',0); end if;
 batch:=(result->>'batch')::uuid;
 for r in select value from jsonb_array_elements(p_rows) order by (value->>'workId')::bigint nulls last,(value->>'bookmarkId')::bigint loop
  if public.apply_ao3_bookmark_observation(r) then added:=added+1;
  elsif r->>'workStatus'='deleted' then kept:=kept+1; end if;
  -- Source observations must not invalidate a new job's personal-edit fence.
  if batch is not null then
   update public.metadata_jobs j set bookmark_import=jsonb_set(j.bookmark_import,'{version}',to_jsonb(e.updated_at)) from public.library_entries e join public.works w on w.id=e.work_id
    where j.batch_id=batch and j.entry_id=e.id and w.ao3_work_id=(r->>'workId')::bigint and j.bookmark_import is not null;
  end if;
 end loop;
 return result||jsonb_build_object('imported',(result->>'imported')::integer+added,'kept',(result->>'kept')::integer+kept);
end $$;
revoke all on function public.submit_ao3_csv_import(jsonb) from public,anon,authenticated;
revoke all on function public.preview_ao3_csv_import(bigint[],bigint[]) from public,anon,authenticated;
grant execute on function public.submit_ao3_csv_import(jsonb),public.preview_ao3_csv_import(bigint[],bigint[]) to authenticated;

-- Undo retains bookmark-only entries and their status, with exact source identity.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.restore_library_story(jsonb,uuid[],text[])'::regprocedure) into definition;
 updated:=replace(definition, 'then
    raise exception ''Work identity does not match the original AO3 URL''', $hook$and not exists(select 1 from public.works w where w.id=restored.work_id and w.ao3_work_id is null and restored.work_status='deleted' and restored.original_url='https://archiveofourown.org/bookmarks/'||(restored.source_bookmark->>'id')) then
    raise exception 'Work identity does not match the original AO3 URL'$hook$);
 -- Parenthesize the old OR condition so the exception applies to both checks.
 updated:=replace(updated,'if restored.original_url is null or trim(restored.original_url)', 'if (restored.original_url is null or trim(restored.original_url)');
 updated:=replace(updated,'::bigint) and not exists', '::bigint)) and not exists');
 if updated=definition then raise exception 'Review deleted bookmark undo'; end if;
 execute updated;
end $$;
do $$ begin execute pg_get_functiondef('public.submit_ao3_library_sync(jsonb)'::regprocedure); end $$;
select public.refresh_library_documents(array(select id from public.library_entries));
notify pgrst,'reload schema';
commit;
