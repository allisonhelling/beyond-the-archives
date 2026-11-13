begin;

-- The private entry remains the single source-version identity from Phase 1.
-- General-source metadata stays in private overrides; the work is an empty UUID
-- stub, never shared AO3 metadata and never a made-up AO3/native number.
alter table public.library_entries add column source_url text, add column metadata_confirmation_times jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata_confirmation_times)='object');
-- Fixed UTF-8 encoding makes this deterministic; a bounded digest also keeps
-- valid long URLs below PostgreSQL's B-tree entry limit. Full URL comparisons
-- below, rather than the digest, govern duplicate review and source identity.
create function public.manual_story_url_hash(p_url text) returns bytea
language sql immutable strict set search_path='' as $$ select sha256(convert_to(p_url,'UTF8')); $$;
revoke all on function public.manual_story_url_hash(text) from public,anon;
grant execute on function public.manual_story_url_hash(text) to authenticated,service_role;
create unique index library_source_url_identity on public.library_entries(user_id,public.manual_story_url_hash(source_url)) where source_url is not null;

create function public.manual_story_url(p_url text) returns text
language plpgsql immutable set search_path='' as $$
declare parts text[]; host text; scheme text; path text;
begin
 if p_url is null or length(p_url)>8192 or p_url ~ '[[:cntrl:]]' then raise exception 'Enter a valid public story URL' using errcode='22023'; end if;
 parts:=regexp_match(trim(p_url),'^(https?)://([a-zA-Z0-9.-]+)(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$','i');
 if parts is null then raise exception 'Enter a public HTTP(S) story URL without credentials' using errcode='22023'; end if;
 scheme:=lower(parts[1]); host:=lower(parts[2]);
 if host !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]*$' or host ~ '(^|\.)(localhost|local|internal)$'
  or host in ('archiveofourown.org','www.archiveofourown.org','web.archive.org')
  or (parts[3] is not null and substring(parts[3] from 2)::integer not between 1 and 65535) then
  raise exception 'Enter a valid public unsupported-site story URL' using errcode='22023';
 end if;
 path:=coalesce(parts[4],'');
 if path='' or left(path,1) in ('?','#') then path:='/'||path; end if;
 return scheme||'://'||host||case when parts[3]=(case scheme when 'http' then ':80' else ':443' end) then '' else coalesce(parts[3],'') end||path;
end $$;
revoke all on function public.manual_story_url(text) from public,anon;
grant execute on function public.manual_story_url(text) to authenticated,service_role;

-- The browser's Phase 1 URL parser serializes international hosts, dot paths
-- and escaped characters into the candidate. Preserve its exact submission as
-- separate private evidence, never as verified canonical identity or a fetch URL.
create function public.valid_story_submission(p_url text) returns boolean
language plpgsql immutable set search_path='' as $$
declare parts text[]; host text;
begin
 if p_url is null or length(p_url)>8192 or p_url ~ '[[:cntrl:]]' then return false; end if;
 parts:=regexp_match(trim(p_url),'^https?://([^/:?#@[:space:]\\]+)(:[0-9]{1,5})?([/?#][^[:cntrl:]\\]*)?$','i');
 if parts is null then return false; end if;
 host:=lower(parts[1]);
 return host like '%.%' and host !~ '^[0-9.]+$' and host !~ '(^|\.)(localhost|local|internal)$'
  and host not in ('archiveofourown.org','www.archiveofourown.org','web.archive.org')
  and (parts[2] is null or substring(parts[2] from 2)::integer between 1 and 65535);
end $$;
revoke all on function public.valid_story_submission(text) from public,anon;
grant execute on function public.valid_story_submission(text) to authenticated,service_role;

-- Extend the established writer; keep its collection/tag handling and AO3 checks.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
 updated:=replace(definition,'tag_uuid uuid;', 'tag_uuid uuid; candidate text; duplicates jsonb; submitted text:=nullif(current_setting(''app.submitted_story_url'',true),'''');');
 updated:=replace(updated, '  -- Strict work URL allowlist.', $new$
  if p_id is not null then select source_url into candidate from public.library_entries where id=p_id and user_id=owner_id for update; end if;
  if candidate is not null or trim(p_url) !~* '^https?://(www\.)?archiveofourown\.org/' and trim(p_url) !~* '^https?://web\.archive\.org/' then
   if candidate is not null and candidate<>public.manual_story_url(p_url) then raise exception 'Story source identity cannot be changed' using errcode='22023'; end if;
   candidate:=public.manual_story_url(p_url);
   submitted:=coalesce(submitted,p_url);
   if not public.valid_story_submission(submitted) then raise exception 'Enter a safe public HTTP(S) submission URL' using errcode='22023'; end if;
   if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':manual-story:'||rtrim(split_part(split_part(candidate,'?',1),'#',1),'/'),0));
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',coalesce(metadata_overrides->>'title','Untitled Story'),'exact',source_url=candidate)),'[]') into duplicates from
     (select id,metadata_overrides,source_url from public.library_entries where user_id=owner_id and source_url is not null
      and rtrim(split_part(split_part(source_url,'?',1),'#',1),'/')=rtrim(split_part(split_part(candidate,'?',1),'#',1),'/')
      order by (source_url=candidate) desc,id limit 25) candidate_rows;
    if duplicates<>'[]'::jsonb and (current_setting('app.allow_separate_story',true) is distinct from 'true'
      or exists(select 1 from jsonb_array_elements(duplicates) d where d->'exact'='true'::jsonb)) then
     raise exception 'Review similar story URLs before saving' using errcode='23505',detail=jsonb_build_object('similarStories',duplicates)::text;
    end if;
   end if;
   if p_id is null and (jsonb_typeof(p_metadata->'published_chapters') is distinct from 'number'
    or (p_metadata->>'published_chapters') !~ '^[0-9]+$' or (p_metadata->>'published_chapters')::numeric not between 1 and 100000
    or jsonb_typeof(p_metadata->'chapter_count_manual') is distinct from 'boolean') then
    raise exception 'Enter 1–100,000 published chapters and confirm how the count was supplied' using errcode='22023';
   end if;
  end if;
  -- Strict work URL allowlist.$new$);
 updated:=replace(updated, 'then
    raise exception ''Enter a supported AO3 work URL''', 'and candidate is null then
    raise exception ''Enter a supported AO3 work URL''');
 updated:=replace(updated, 'work_key := substring(', 'work_key := case when candidate is null then substring(');
 updated:=replace(updated, 'from ''/works/([1-9][0-9]*)'')::bigint;', 'from ''/works/([1-9][0-9]*)'')::bigint end;');
 updated:=replace(updated, '    insert into public.works(ao3_work_id)', '    if candidate is not null then insert into public.works default values returning id into work_uuid; else
    insert into public.works(ao3_work_id)');
 updated:=replace(updated, 'where ao3_work_id = work_key;', 'where ao3_work_id = work_key; end if;');
 updated:=replace(updated, 'user_id,work_id,original_url,metadata_overrides,', 'user_id,work_id,original_url,source_url,metadata_overrides,');
 updated:=replace(updated, 'values(owner_id,work_uuid,p_url,p_metadata,', 'values(owner_id,work_uuid,case when candidate is null then p_url else submitted end,candidate,p_metadata,');
 updated:=replace(updated,'w.ao3_work_id is null and e.original_url=p_url)) for update of e;', 'w.ao3_work_id is null and (e.original_url=p_url or e.source_url=candidate))) for update of e;');
 if updated=definition or position('source_url,metadata_overrides' in updated)=0 then raise exception 'Review universal save patch'; end if;
 execute updated;
end $$;

create function public.validate_story_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.source_url,new.work_id,new.original_url) is distinct from (old.source_url,old.work_id,old.original_url)
  and (new.source_url is not null or old.source_url is not null) then raise exception 'Story source identity cannot be changed' using errcode='22023'; end if;
 if new.source_url is not null then
  if new.source_url is distinct from public.manual_story_url(new.source_url) or not public.valid_story_submission(new.original_url)
   or not exists(select 1 from public.works w where w.id=new.work_id and w.ao3_work_id is null and w.canonical_url is null)
   or new.source_bookmark<>'{}'::jsonb then raise exception 'Invalid private story source' using errcode='22023'; end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_story_source() from public,anon,authenticated;
create trigger validate_story_source before insert or update on public.library_entries for each row execute function public.validate_story_source();

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.restore_library_story(jsonb,uuid[],text[])'::regprocedure) into definition;
 updated:=replace(definition, 'then
    raise exception ''Work identity does not match the original AO3 URL''', $new$and not (restored.source_url is not null and restored.source_url=public.manual_story_url(restored.source_url) and public.valid_story_submission(restored.original_url)
   and exists(select 1 from public.works w where w.id=restored.work_id and w.ao3_work_id is null and w.canonical_url is null)) then
    raise exception 'Work identity does not match the original AO3 URL'$new$);
 if updated=definition then raise exception 'Review universal Undo patch'; end if;
 execute updated;
 -- to_jsonb(e) includes the additive private column on recompilation.
 select pg_get_viewdef('public.library_story_documents'::regclass,true) into definition;
 definition:=replace(definition,'WHEN base.ao3_work_id IS NULL','WHEN e.source_url IS NOT NULL THEN ''Untitled Story''::text WHEN base.ao3_work_id IS NULL');
 definition:=replace(definition,$old$WHEN e.work_status = 'deleted'::text THEN$old$, $new$WHEN e.work_status = 'deleted'::text AND NOT (e.metadata_overrides ? 'publication_status'::text) THEN$new$);
 execute 'create or replace view public.library_story_documents with (security_invoker=true) as '||definition;
 select pg_get_functiondef('public.library_catalog_story(jsonb)'::regprocedure) into definition;
 execute replace(definition,'''work_id'',s->''work_id'',', '''work_id'',s->''work_id'',''source_url'',s->''source_url'',');
end $$;

-- Foreign labels cannot acquire AO3 hierarchy evidence from matching spelling.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.index_library_document()'::regprocedure) into definition;
 updated:=replace(definition,$old$new.story:=new.story||public.ensure_fandom_classification(new.user_id,new.story->'metadata'->'fandoms',coalesce(new.story->'metadata_overrides'->'fandoms'='[]'::jsonb,false));$old$,
 $new$new.story:=new.story||case when new.story->>'source_url' is not null then public.fandom_classification_document('unknown',0,null) else public.ensure_fandom_classification(new.user_id,new.story->'metadata'->'fandoms',coalesce(new.story->'metadata_overrides'->'fandoms'='[]'::jsonb,false)) end;$new$);
 if updated=definition then raise exception 'Review source-qualified classification'; end if;
 updated:=replace(updated,$old$new.crossover_key:=public.library_fandom_key(new.story->'metadata'->'fandoms',coalesce(new.story->'metadata_overrides'->'fandoms'='[]'::jsonb,false));$old$, $new$new.crossover_key:=case when new.story->>'source_url' is not null then null else public.library_fandom_key(new.story->'metadata'->'fandoms',coalesce(new.story->'metadata_overrides'->'fandoms'='[]'::jsonb,false)) end;$new$);
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
