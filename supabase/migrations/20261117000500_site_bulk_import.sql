begin;

-- A site import item is its own retrieval checkpoint. AO3 metadata jobs still
-- use their existing work-id queue and their existing companion contract.
alter table public.import_batches add column site_import boolean not null default false;
alter table public.import_items
 add column source_url text,
 add column site_recognized boolean,
 add column site_lease uuid,
 add column site_lease_until timestamptz,
 add column site_attempts integer not null default 0 check(site_attempts between 0 and 4),
 add constraint import_items_site_source_valid check(source_url is null or source_url=original_url and source_url=public.manual_story_url(source_url));
create index import_items_site_queue on public.import_items(batch_id, status, ordinal) where source_url is not null;
create index import_items_site_identity on public.import_items(batch_id,public.manual_story_url_hash(source_url)) where source_url is not null;
create index import_items_site_review on public.import_items(batch_id, entry_id) where source_url is not null and result='imported';

create function public.submit_site_import(p_batch uuid,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); item record; candidate text; saved uuid; prior uuid;
begin
 if owner_id is null then raise exception 'Sign in to import links' using errcode='42501'; end if;
 if p_batch is null or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_array_length(p_items) not between 1 and 2000 or octet_length(p_items::text)>4000000 then
  raise exception 'Submit 1–2,000 links at a time' using errcode='22023';
 end if;
 insert into public.import_batches(id,user_id,site_import) values(p_batch,owner_id,true) on conflict do nothing;
 if not found then
  if exists(select 1 from public.import_batches where id=p_batch and user_id=owner_id and site_import) then return p_batch; end if;
  raise exception 'Batch unavailable' using errcode='42501';
 end if;
 for item in select value,ordinality from jsonb_array_elements(p_items) with ordinality loop
  begin
   candidate:=public.manual_story_url(item.value->>'url');
   if candidate ~* '[?&#]([^=&#]*[_-])?(token|password|passwd|secret|session|signature|credential|key|auth|code)([_-][^=&#]*)?(=|$)' then
    raise exception 'Unsafe source URL' using errcode='22023';
   end if;
   select id into saved from public.library_entries where user_id=owner_id and public.manual_story_url_hash(source_url)=public.manual_story_url_hash(candidate) and source_url=candidate;
   select id into prior from public.import_items where batch_id=p_batch and public.manual_story_url_hash(source_url)=public.manual_story_url_hash(candidate) and source_url=candidate order by ordinal limit 1;
   insert into public.import_items(batch_id,user_id,ordinal,original_url,source_url,site_recognized,status,metadata_status,result,entry_id,duplicate_of)
   values(p_batch,owner_id,item.ordinality,candidate,candidate,coalesce(item.value->'recognized'='true'::jsonb,false),
    case when prior is not null or saved is not null then 'skipped' else 'pending' end,
    case when prior is not null or saved is not null then 'not_requested' else 'pending' end,
    case when prior is not null then 'duplicate' when saved is not null then 'already_saved' else 'queued' end,saved,prior);
  exception when invalid_parameter_value then
   insert into public.import_items(batch_id,user_id,ordinal,original_url,status,metadata_status,result,error_category,error_message,completed_at)
   values(p_batch,owner_id,item.ordinality,'[URL omitted]','failed','not_requested','invalid','invalid_url','This link did not pass the public HTTP(S) URL checks.',now());
  end;
 end loop;
 return p_batch;
end $$;

create function public.site_import_origins(p_batch uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(o) order by o.url),'[]') from (
  select distinct on (substring(i.source_url from '^https?://[^/?#]+')) i.source_url url
  from public.import_items i join public.import_batches b on b.id=i.batch_id and b.user_id=i.user_id
  where i.batch_id=p_batch and i.user_id=(select auth.uid()) and b.cancelled_at is null
   and i.status in ('pending','processing') and i.source_url is not null
  order by substring(i.source_url from '^https?://[^/?#]+'),i.ordinal
 ) o;
$$;

create function public.claim_site_import(p_batch uuid,p_origin text,p_url text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); job public.import_items; lease uuid:=gen_random_uuid();
begin
 perform 1 from public.import_batches where id=p_batch and user_id=owner_id and cancelled_at is null for update;
 if not found then return null; end if;
 update public.import_items set status='failed',metadata_status='failed',completed_at=now(),site_lease=null,site_lease_until=null,
  error_category='attempt_limit',error_message='Retrieval was interrupted too many times.'
 where batch_id=p_batch and site_attempts=4 and status='processing' and site_lease_until<=now();
 select * into job from public.import_items where batch_id=p_batch and user_id=owner_id
  and substring(source_url from '^https?://[^/?#]+')=p_origin and site_attempts<4 and (p_url is null or source_url=p_url)
  and (status='pending' or status='processing' and site_lease_until<=now())
 order by ordinal limit 1 for update skip locked;
 if not found then return null; end if;
 update public.import_items set status='processing',metadata_status='processing',last_attempt_at=now(),
  site_lease=lease,site_lease_until=now()+interval '90 seconds',site_attempts=site_attempts+1 where id=job.id;
 return jsonb_build_object('id',job.id,'url',job.source_url,'token',lease,'expiresAt',now()+interval '90 seconds','recognized',job.site_recognized);
end $$;

-- Only the fenced queue finisher can take the deferred-count path.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
 updated:=replace(definition,'if p_id is null and (jsonb_typeof(p_metadata->''published_chapters'')',
  'if p_id is null and not (current_setting(''app.site_bulk'',true) is not distinct from ''true'' and p_metadata->''published_chapters''=''null''::jsonb and p_metadata->''chapter_count_manual''=''false''::jsonb) and (jsonb_typeof(p_metadata->''published_chapters'')');
 if updated=definition then raise exception 'Review queued unknown count save guard'; end if;
 execute updated;
end $$;

create function public.finish_site_import(p_batch uuid,p_item uuid,p_token uuid,p_metadata jsonb default null,p_observations jsonb default null,p_problem text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); item public.import_items; target uuid; outcome text:='imported'; problem text; imported_title text; count_value text;
begin
 perform 1 from public.import_batches where id=p_batch and user_id=owner_id and cancelled_at is null for update;
 if not found then return false; end if;
 select * into item from public.import_items where id=p_item and batch_id=p_batch and user_id=owner_id and status='processing'
  and site_lease=p_token and site_lease_until>now() for update;
 if not found then return false; end if;
 if p_problem is not null then
  problem:=case p_problem when 'needs_story_evidence' then 'Story evidence was insufficient. Review this link or add a matching site rule before retrying.'
   when 'redirected' then 'The tab left the submitted URL. Check the link and retry.'
   else 'The companion could not read this page. Check the tab and retry.' end;
 else
  begin
   -- The existing writer protects exact/near identities and all personal data.
   select id into target from public.library_entries where user_id=owner_id and public.manual_story_url_hash(source_url)=public.manual_story_url_hash(item.source_url) and source_url=item.source_url;
   if target is not null then outcome:='already_saved';
   else
    imported_title:=p_metadata->>'title'; count_value:=p_metadata->>'published_chapters';
    if jsonb_typeof(p_metadata) is distinct from 'object' or octet_length(p_metadata::text)>34000
      or imported_title is null or length(trim(imported_title)) not between 1 and 500
      or p_metadata - array['title','authors','fandoms','summary','ao3_tags','categories','published_chapters','total_chapters','publication_status','relationship_tags','character_tags','additional_tags','chapter_count_manual'] <> '{}'::jsonb
      or count_value is not null and (count_value !~ '^[0-9]{1,6}$' or count_value::integer not between 1 and 100000)
    then raise exception 'Invalid extraction data' using errcode='22023'; end if;
    perform set_config('app.site_bulk','true',true);
    target:=public.save_companion_story(null,item.source_url,jsonb_build_object(
     'metadata',p_metadata||jsonb_build_object('published_chapters',count_value::integer,'chapter_count_manual',false),
     'status','to_read','progress',0,'notes','','favorite',false,'collections','[]'::jsonb,'tags','[]'::jsonb
    ),null,coalesce(p_observations,'{}'::jsonb));
    perform set_config('app.site_bulk','',true);
   end if;
  exception when unique_violation then
   select id into target from public.library_entries where user_id=owner_id and source_url=item.source_url;
   if target is not null then outcome:='already_saved'; else problem:='A similar story URL is saved. Review the URL before adding this story.'; end if;
  when data_exception or check_violation then
   problem:='The captured metadata could not be saved. Review this link or its mapping and retry.';
  end;
 end if;
 update public.import_items set entry_id=target,status=case when problem is null then 'completed' else 'failed' end,
  metadata_status=case when problem is null then 'completed' else 'failed' end,result=case when problem is null then outcome else 'extraction_failed' end,
  error_category=case when problem is not null then 'site_extraction' end,error_message=problem,
  completed_at=now(),site_lease=null,site_lease_until=null where id=item.id;
 return true;
end $$;

create function public.retry_site_import(p_batch uuid,p_item uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 perform 1 from public.import_batches where id=p_batch and user_id=owner_id for update;
 if not found then raise exception 'Batch unavailable' using errcode='42501'; end if;
 if p_item is null then
  update public.import_batches set cancelled_at=null where id=p_batch and site_import and cancelled_at is not null;
  if not found then return; end if;
 end if;
 update public.import_items set status='pending',metadata_status='pending',result='queued',site_lease=null,site_lease_until=null,completed_at=null,error_category=null,error_message=null
 where batch_id=p_batch and user_id=owner_id and source_url is not null and site_attempts<4
  and (p_item is null and status='cancelled' or id=p_item and status='failed' and not exists(select 1 from public.import_batches where id=p_batch and cancelled_at is not null));
 if p_item is not null and not found then raise exception 'Retry unavailable' using errcode='22023'; end if;
end $$;

revoke all on function public.submit_site_import(uuid,jsonb),public.site_import_origins(uuid),
 public.claim_site_import(uuid,text,text),public.finish_site_import(uuid,uuid,uuid,jsonb,jsonb,text),public.retry_site_import(uuid,uuid) from public,anon;
grant execute on function public.submit_site_import(uuid,jsonb),public.site_import_origins(uuid),
 public.claim_site_import(uuid,text,text),public.finish_site_import(uuid,uuid,uuid,jsonb,jsonb,text),public.retry_site_import(uuid,uuid) to authenticated;

-- Build count review on imported entry IDs, so external edits and deletion
-- immediately leave the review queue and the batch result remains an audit row.
create function public.review_import_counts(p_batch uuid,p_page integer default 1,p_size integer default 25,p_progress boolean default false,p_edits jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); edit jsonb; entry public.library_entries; n integer; saved integer:=0; issues jsonb:='{}'; count_page jsonb;
begin
 if owner_id is null or not exists(select 1 from public.import_batches where id=p_batch and user_id=owner_id) then raise exception 'Batch unavailable' using errcode='42501'; end if;
 if p_size is null or p_size not in (10,25,50) then raise exception 'Choose 10, 25, or 50 stories per page' using errcode='22023'; end if;
 if p_edits is not null then
  if jsonb_typeof(p_edits) is distinct from 'array' or jsonb_array_length(p_edits)>50 then raise exception 'Submit up to 50 count edits' using errcode='22023'; end if;
  for edit in select j from jsonb_array_elements(p_edits) j order by j->>'id' loop
   begin
    if coalesce(edit->>'count','') !~ '^[0-9]{1,6}$' or (edit->>'count')::integer not between 1 and 100000
     or edit->'manual' is distinct from 'true'::jsonb then raise exception 'Enter 1–100,000 chapters and confirm manual provenance' using errcode='22023'; end if;
    n:=(edit->>'count')::integer;
    select e.* into entry from public.library_entries e
    where e.user_id=owner_id and e.id=(edit->>'id')::uuid and exists(select 1 from public.import_items i
     where i.batch_id=p_batch and i.entry_id=e.id and i.user_id=owner_id and i.source_url is not null and i.result='imported') for update;
    if not found or edit->>'revision' is distinct from entry.updated_at::text or public.entry_chapter_metadata(entry)->>'published_chapters' is not null then
     raise exception 'This story changed. Reload before saving its count.' using errcode='40001'; end if;
    update public.library_entries set metadata_overrides=metadata_overrides||jsonb_build_object('published_chapters',n,'chapter_count_manual',true)
    where id=entry.id and user_id=owner_id;
    saved:=saved+1;
   exception when data_exception or serialization_failure or check_violation then
    issues:=issues||jsonb_build_object(coalesce(edit->>'id','unknown'),sqlerrm);
   end;
  end loop;
 end if;
 with queue as materialized (
  select e.id,e.updated_at::text revision,e.last_read_chapter progress,
   coalesce(e.metadata_overrides->>'title',e.extension_metadata->>'title','Untitled Story') title,
   min(i.ordinal) ordinal
  from public.import_items i join public.library_entries e on e.id=i.entry_id and e.user_id=i.user_id
  where i.batch_id=p_batch and i.user_id=owner_id and i.result='imported' and i.source_url is not null
   and public.entry_chapter_metadata(e)->>'published_chapters' is null
  group by e.id
 ), counts as (
  select count(*) total,greatest(1,ceil(count(*)::numeric/p_size)::integer) pages from queue where not coalesce(p_progress,false) or progress>0
 ), page as (
  select id,revision,progress,title,ordinal from queue where not coalesce(p_progress,false) or progress>0
  order by ordinal,id offset (select (greatest(1,least(p_page,pages))-1)*p_size from counts) limit p_size
 )
 select jsonb_build_object('total',total,'pages',pages,'page',greatest(1,least(p_page,pages)),
  'reviewNeeded',(select count(*) from queue),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by ordinal,id) from page p),'[]'))
 into count_page from counts;
 return count_page||jsonb_build_object('saved',saved,'issues',issues);
end $$;
revoke all on function public.review_import_counts(uuid,integer,integer,boolean,jsonb) from public,anon;
grant execute on function public.review_import_counts(uuid,integer,integer,boolean,jsonb) to authenticated;

do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.paged_import_history(uuid,integer,integer,text)'::regprocedure) into definition;
 updated:=replace(definition,E'\n ''completed'',', $new$'siteBatch',coalesce((select site_import from batches where id=(select id from selected)),false),
 'reviewNeeded',(select count(*) from items i join public.library_entries e on e.id=i.entry_id and e.user_id=i.user_id
  join public.library_search_documents d on d.id=e.id and d.user_id=e.user_id
  where i.source_url is not null and i.result='imported' and d.story->'metadata'->>'published_chapters' is null),
 'completed',$new$);
 if updated=definition then raise exception 'Review paged import summary'; end if;
 execute updated;
end $$;

-- Keep older AO3 backups readable and sanitize resumable queue credentials.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.export_library_backup()'::regprocedure) into definition;
 updated:=replace(definition, '  tables:=tables||jsonb_build_object(t,rows);', $new$
  if t='import_batches' then
   select coalesce(jsonb_agg(case when r->'site_import'='false'::jsonb then r-'site_import' else r end),'[]')
    into rows from jsonb_array_elements(rows) r;
  elsif t='import_items' then
   select coalesce(jsonb_agg(case when r->>'source_url' is null
    then r-array['source_url','site_recognized','site_attempts','site_lease','site_lease_until']
    else r-array['site_lease','site_lease_until'] end),'[]')
    into rows from jsonb_array_elements(rows) r;
  end if;
  tables:=tables||jsonb_build_object(t,rows);$new$);
 if updated=definition then raise exception 'Review import backup projection'; end if;
 execute updated;

 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition, $old$  elsif t='import_items' then
   select coalesce(jsonb_agg(r$old$, $new$  elsif t='import_batches' then
   select coalesce(jsonb_agg(r||jsonb_build_object('site_import',coalesce((r->>'site_import')::boolean,false))),'[]')
    into rows from jsonb_array_elements(rows) r;
  elsif t='import_items' then
   select coalesce(jsonb_agg(r||jsonb_build_object('site_lease',null,'site_lease_until',null,'site_attempts',
    least(coalesce((r->>'site_attempts')::integer,0),case when r->>'status'='processing' then 3 else 4 end))$new$);
 if updated=definition then raise exception 'Review import backup defaults'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
