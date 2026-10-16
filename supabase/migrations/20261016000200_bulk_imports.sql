begin;
-- Extend the existing manual-save URL allowlist without copying the save implementation.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
 updated:=replace(definition,'archiveofourown\.org/works/','archiveofourown\.org/(collections/[^/?#[:space:]]+/)?works/');
 if updated=definition then raise exception 'Manual URL allowlist changed; review migration'; end if;
 -- Existing records accept field-level patches; new manual entries still require a title.
 updated:=replace(updated,
  $old$if jsonb_typeof(p_metadata) <> 'object' or coalesce(length(trim(p_metadata->>'title')),0) = 0 then$old$,
  $new$if jsonb_typeof(p_metadata) <> 'object' or ((p_id is null or p_metadata ? 'title') and coalesce(length(trim(p_metadata->>'title')),0) = 0) then$new$);
 execute updated;
end $$;
alter table public.works add column automatic_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(automatic_metadata)='object');
alter table public.works add column last_metadata_success timestamptz;
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), cancelled_at timestamptz, unique(id,user_id)
);
create table public.import_items (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null, user_id uuid not null,
 ordinal integer not null, original_url text not null, ao3_work_id bigint, chapter_id text,
 status text not null check(status in ('pending','processing','completed','failed','skipped','cancelled')),
 result text, metadata_status text not null default 'pending', error_category text, error_message text,
 entry_id uuid references public.library_entries(id) on delete set null, duplicate_of uuid references public.import_items(id),
 verified_position integer check(verified_position>0), last_attempt_at timestamptz, completed_at timestamptz,
 foreign key(batch_id,user_id) references public.import_batches(id,user_id) on delete cascade,
 unique(batch_id,ordinal), unique(id,user_id)
);
create table public.metadata_jobs (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null, user_id uuid not null, work_id uuid not null references public.works(id),
 entry_id uuid references public.library_entries(id) on delete set null, created_entry boolean not null,
 status text not null default 'pending' check(status in ('pending','processing','completed','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 4), retryable boolean not null default false,
 next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 last_attempt_at timestamptz, completed_at timestamptz, error_category text, error_message text,
 created_at timestamptz not null default now(), foreign key(batch_id,user_id) references public.import_batches(id,user_id) on delete cascade,
 unique(batch_id,work_id), unique(id,user_id)
);
create table public.processing_logs (
 id uuid primary key default gen_random_uuid(), job_id uuid not null, user_id uuid not null,
 created_at timestamptz not null default now(), category text not null, message text not null,
 foreign key(job_id,user_id) references public.metadata_jobs(id,user_id) on delete cascade
);
-- A single global gate conservatively serializes all AO3 traffic, including multiple worker hosts.
create table public.metadata_worker_state (id integer primary key check(id=1), next_request_at timestamptz not null default now(), paused_until timestamptz, reason text);
insert into public.metadata_worker_state(id) values(1);
alter table public.metadata_worker_state enable row level security;
alter table public.metadata_worker_state force row level security;
revoke all on public.metadata_worker_state from public,anon,authenticated;
grant all on public.metadata_worker_state to service_role;
create index import_items_batch_idx on public.import_items(batch_id,ordinal);
create index import_items_user_idx on public.import_items(user_id);
create index metadata_jobs_due_idx on public.metadata_jobs(status,next_attempt_at);
create index metadata_jobs_work_idx on public.metadata_jobs(work_id);
create index metadata_jobs_entry_idx on public.metadata_jobs(entry_id);
create index import_items_entry_idx on public.import_items(entry_id);
create index import_items_duplicate_idx on public.import_items(duplicate_of);
create index metadata_jobs_user_idx on public.metadata_jobs(user_id);
create index processing_logs_job_idx on public.processing_logs(job_id,created_at);
create index processing_logs_user_idx on public.processing_logs(user_id);
do $$ declare t text; begin
 foreach t in array array['import_batches','import_items','metadata_jobs','processing_logs'] loop
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(user_id=auth.uid())',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create function public.submit_import_urls(p_urls text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); batch uuid; original text; m text[]; wid bigint; work_uuid uuid; entry_uuid uuid; first_item uuid; n integer:=0; created boolean;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if coalesce(array_length(p_urls,1),0)=0 or array_length(p_urls,1)>2000 then raise exception 'Submit 1–2000 URLs'; end if;
 insert into public.import_batches(user_id) values(owner_id) returning id into batch;
 foreach original in array p_urls loop
  if length(original)>4096 then raise exception 'URL too long'; end if;
  -- Do not track unrelated hosts, including AO3 lookalike domains.
  if trim(original) !~ '^https?://([^/@[:space:]]+@)?(www\.)?archiveofourown\.org([/:?#]|$)' then continue; end if;
  n:=n+1;
  m:=regexp_match(trim(original),'^https?://(www\.)?archiveofourown\.org/(collections/[^/?#[:space:]]+/)?works/([1-9][0-9]*)(/chapters/([1-9][0-9]*))?/?([?#][^[:space:]]*)?$');
  if m is null or length(m[3])>16 or m[3]::numeric>9007199254740991 or length(m[5])>16 or m[5]::numeric>9007199254740991 then
   insert into public.import_items(batch_id,user_id,ordinal,original_url,status,result,metadata_status,error_category,error_message,completed_at)
    values(batch,owner_id,n,original,'failed','invalid','not_requested',case when original like '%/works/%' then 'invalid_url' else 'unsupported_url' end,'Enter a supported AO3 work URL with valid work and chapter identifiers.',now());
   continue;
  end if;
  wid:=m[3]::bigint;
  insert into public.works(ao3_work_id) values(wid) on conflict(ao3_work_id) do nothing;
  select id into work_uuid from public.works where ao3_work_id=wid;
  entry_uuid:=null;
  insert into public.library_entries(user_id,work_id,original_url) values(owner_id,work_uuid,original)
   on conflict(user_id,work_id) do nothing returning id into entry_uuid;
  created:=entry_uuid is not null;
  if entry_uuid is null then select id into entry_uuid from public.library_entries where user_id=owner_id and work_id=work_uuid; end if;
  select id into first_item from public.import_items where batch_id=batch and ao3_work_id=wid order by ordinal limit 1;
  insert into public.import_items(batch_id,user_id,ordinal,original_url,ao3_work_id,chapter_id,status,result,entry_id,duplicate_of)
   values(batch,owner_id,n,original,wid,m[5],case when first_item is null then 'pending' else 'skipped' end,
   case when first_item is not null then 'duplicate' when created then 'imported' else 'already_saved' end,entry_uuid,first_item);
  insert into public.metadata_jobs(batch_id,user_id,work_id,entry_id,created_entry) values(batch,owner_id,work_uuid,entry_uuid,created) on conflict(batch_id,work_id) do nothing;
 end loop;
 if n=0 then delete from public.import_batches where id=batch; return null; end if;
 return batch;
end $$;

create function public.cancel_import_batch(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare active_until timestamptz;
begin
 update public.import_batches set cancelled_at=coalesce(cancelled_at,now()) where id=p_batch and user_id=auth.uid();
 if not found then raise exception 'Batch unavailable' using errcode='42501'; end if;
 select max(lease_until) into active_until from public.metadata_jobs where batch_id=p_batch and status='processing';
 update public.metadata_jobs set status='cancelled',lease_token=null,lease_until=null,completed_at=now() where batch_id=p_batch and status in ('pending','processing');
 -- Cancellation cannot abort a request already sent. Keep the global gate until its lease expires.
 update public.metadata_worker_state set next_request_at=greatest(next_request_at,coalesce(active_until,now())) where id=1;
 update public.import_items set status=case when status='skipped' then status else 'cancelled' end,metadata_status='cancelled',completed_at=now() where batch_id=p_batch and metadata_status in ('pending','processing');
end $$;
create function public.retry_metadata_job(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.metadata_jobs;
begin
 select * into j from public.metadata_jobs where id=p_job and user_id=auth.uid() for update;
 if j.id is null then raise exception 'Job unavailable' using errcode='42501'; end if;
 if j.status<>'failed' or not j.retryable or j.attempts>=4 or exists(select 1 from public.import_batches where id=j.batch_id and cancelled_at is not null) then raise exception 'Retry unavailable'; end if;
 update public.metadata_jobs set status='pending',next_attempt_at=greatest(next_attempt_at,now()) where id=j.id;
 update public.import_items set status=case when duplicate_of is null then 'pending' else 'skipped' end,metadata_status='pending' where batch_id=j.batch_id and entry_id=j.entry_id;
end $$;

create function public.claim_metadata_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare gate public.metadata_worker_state; j public.metadata_jobs; token uuid:=gen_random_uuid(); wid bigint;
begin
 select * into gate from public.metadata_worker_state where id=1 for update skip locked;
 if gate.id is null or gate.next_request_at>now() or gate.paused_until>now() then return null; end if;
 -- An expired lease is retryable; fencing tokens make any late completion harmless.
 update public.metadata_jobs set status='failed',retryable=false,error_category='worker_interrupted',error_message='Worker interrupted; maximum attempts reached.',completed_at=now()
 where status='processing' and lease_until<now() and attempts>=4;
 update public.import_items i set status=case when duplicate_of is null then 'failed' else 'skipped' end,metadata_status='failed',error_category=expired.error_category,error_message=expired.error_message
 from public.metadata_jobs expired where expired.batch_id=i.batch_id and expired.entry_id=i.entry_id and expired.error_category='worker_interrupted' and expired.status='failed';
 if exists(select 1 from public.metadata_jobs where status='processing' and lease_until>=now()) then return null; end if;
 select q.* into j from public.metadata_jobs q join public.import_batches b on b.id=q.batch_id
 where b.cancelled_at is null and q.attempts<4 and ((q.status='pending' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<now()))
 order by q.next_attempt_at,q.created_at for update of q skip locked limit 1;
 if j.id is null then return null; end if;
 update public.metadata_jobs set status='processing',attempts=attempts+1,lease_token=token,lease_until=now()+interval '2 minutes',last_attempt_at=now() where id=j.id;
 update public.metadata_worker_state set next_request_at=now()+interval '15 seconds' where id=1;
 update public.import_items set status=case when duplicate_of is null then 'processing' else 'skipped' end,metadata_status='processing',last_attempt_at=now() where batch_id=j.batch_id and entry_id=j.entry_id;
 insert into public.processing_logs(job_id,user_id,category,message) values(j.id,j.user_id,'claimed','Worker acquired a two-minute lease.');
 update public.works set last_metadata_check=now() where id=j.work_id;
 select ao3_work_id into wid from public.works where id=j.work_id;
 return jsonb_build_object('id',j.id,'token',token,'workId',wid,'attempt',j.attempts+1);
end $$;

-- Application-layer commit boundary. Only a trusted worker can call this function.
create function public.finish_metadata_job(p_job uuid,p_token uuid,p_metadata jsonb,p_chapters jsonb,p_category text,p_message text,p_retryable boolean,p_pause_seconds integer default 0) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.metadata_jobs; k text; v_value jsonb; pos integer; best integer; item public.import_items; final_state text; wid bigint; relation_id uuid; v_name text; v_category public.ao3_tag_category;
begin
 select * into j from public.metadata_jobs where id=p_job for update;
 if j.id is null or j.status<>'processing' or j.lease_token is distinct from p_token or j.lease_until<now() then return false; end if;
 if exists(select 1 from public.import_batches where id=j.batch_id and cancelled_at is not null) then return false; end if;
 select ao3_work_id into wid from public.works where id=j.work_id for update;
 if p_pause_seconds>0 then update public.metadata_worker_state set paused_until=now()+make_interval(secs=>greatest(p_pause_seconds,0)),reason=p_category where id=1; end if;
 update public.works set last_metadata_check=now() where id=j.work_id;
 if p_metadata is not null then
  if jsonb_typeof(p_metadata)<>'object' or jsonb_typeof(p_chapters)<>'object' then raise exception 'Invalid adapter result'; end if;
  -- Only non-null, validated automatic fields; private entries are never merged here.
  foreach k in array array['title','summary','rating','word_count','is_complete','ao3_published_at','ao3_updated_at'] loop
   v_value:=p_metadata->k;
   if v_value is null or v_value='null'::jsonb then continue; end if;
   if k in ('title','summary','rating') then execute format('update public.works set %I=$1 where id=$2',k) using p_metadata->>k,j.work_id;
   elsif k in ('word_count','published_chapters','total_chapters') then execute format('update public.works set %I=$1 where id=$2',k) using (p_metadata->>k)::integer,j.work_id;
   elsif k='is_complete' then update public.works set is_complete=(p_metadata->>k)::boolean where id=j.work_id;
   else execute format('update public.works set %I=$1 where id=$2',k) using (p_metadata->>k)::timestamptz,j.work_id; end if;
  end loop;
  update public.works set published_chapters=coalesce((p_metadata->>'published_chapters')::integer,published_chapters),total_chapters=case
   when p_metadata->>'total_chapters' is not null and coalesce((p_metadata->>'published_chapters')::integer,published_chapters,0)<=(p_metadata->>'total_chapters')::integer then (p_metadata->>'total_chapters')::integer
   when coalesce((p_metadata->>'published_chapters')::integer,published_chapters)>total_chapters then null
   else total_chapters end where id=j.work_id;
  if p_metadata ? 'authors' then
   delete from public.work_authors where work_id=j.work_id;
   for v_name in select jsonb_array_elements_text(p_metadata->'authors') loop
    select id into relation_id from public.authors where authors.name=v_name and ao3_url is not distinct from (p_metadata->'author_links'->>v_name) limit 1;
    if relation_id is null then insert into public.authors(name,ao3_url) values(v_name,p_metadata->'author_links'->>v_name) returning id into relation_id; end if;
    insert into public.work_authors(work_id,author_id) values(j.work_id,relation_id) on conflict do nothing;
   end loop;
  end if;
  if p_metadata ? 'fandoms' then
   delete from public.work_fandoms where work_id=j.work_id;
   for v_name in select jsonb_array_elements_text(p_metadata->'fandoms') loop
    insert into public.fandoms(name) values(v_name) on conflict on constraint fandoms_name_key do update set name=excluded.name returning id into relation_id;
    insert into public.work_fandoms(work_id,fandom_id) values(j.work_id,relation_id) on conflict do nothing;
   end loop;
  end if;
  foreach k in array array['relationship_tags','character_tags','additional_tags','archive_warnings','categories'] loop
   if not p_metadata ? k then continue; end if;
   v_category:=case k when 'relationship_tags' then 'relationship' when 'character_tags' then 'character' when 'additional_tags' then 'freeform' when 'archive_warnings' then 'warning' else 'category' end;
   delete from public.work_tags wt using public.tags t where wt.tag_id=t.id and wt.work_id=j.work_id and t.category=v_category;
   for v_name in select jsonb_array_elements_text(p_metadata->k) loop
    insert into public.tags(name,category) values(v_name,v_category) on conflict on constraint tags_name_category_key do update set name=excluded.name returning id into relation_id;
    insert into public.work_tags(work_id,tag_id) values(j.work_id,relation_id) on conflict do nothing;
   end loop;
  end loop;
  foreach k in array array['series','series_memberships'] loop
   if p_metadata ? k and p_metadata->k<>'null'::jsonb then
    update public.works set automatic_metadata=jsonb_set(automatic_metadata,array[k],p_metadata->k) where id=j.work_id;
   end if;
  end loop;
  for k in select jsonb_object_keys(p_metadata) loop
   if p_metadata->k<>'null'::jsonb then update public.works set field_provenance=jsonb_set(field_provenance,array[k],jsonb_build_object('source','ao3','retrieved_at',now())) where id=j.work_id; end if;
  end loop;
  -- Canonical identity was verified by the adapter, never by mere normalization.
  update public.works set canonical_url='https://archiveofourown.org/works/'||wid,canonical_verified_at=now(),metadata_source='ao3',last_metadata_success=now(),verified_chapters=case when p_chapters<>'{}'::jsonb then p_chapters else verified_chapters end where id=j.work_id;
  for item in select * from public.import_items where batch_id=j.batch_id and ao3_work_id=wid loop
   pos:=null;
   if item.chapter_id is not null then select key::integer into pos from jsonb_each_text(p_chapters) where value=item.chapter_id limit 1; end if;
   update public.import_items set verified_position=pos where id=item.id;
  end loop;
  select max(verified_position)-1 into best from public.import_items where batch_id=j.batch_id and ao3_work_id=wid;
  if j.created_entry and best>0 then
   -- Do not change progress if the user edited the entry while retrieval was pending.
   update public.library_entries set last_read_chapter=best,reading_status='reading'
    where id=j.entry_id and user_id=j.user_id and reading_status='to_read' and last_read_chapter=0 and updated_at=created_at;
  end if;
 end if;
 final_state:=case when p_category is null or p_category='partial' then 'completed' when p_retryable and j.attempts<4 and p_category not in ('blocked','rate_limited') then 'pending' else 'failed' end;
 update public.metadata_jobs set status=final_state,retryable=p_retryable and j.attempts<4,next_attempt_at=now()+make_interval(secs=>greatest(30*power(2,j.attempts-1)::integer,p_pause_seconds)),lease_token=null,lease_until=null,error_category=p_category,error_message=p_message,completed_at=case when final_state='pending' then null else now() end where id=j.id;
 update public.import_items set status=case when duplicate_of is not null then 'skipped' else final_state end,metadata_status=case when p_category='partial' then 'partial' else final_state end,error_category=case when p_metadata is not null and chapter_id is not null and verified_position is null then 'unverified_chapter' else p_category end,error_message=case when p_metadata is not null and chapter_id is not null and verified_position is null then 'Chapter ID could not be verified. No progress was inferred.' else p_message end,completed_at=case when final_state='pending' then null else now() end where batch_id=j.batch_id and ao3_work_id=wid;
 insert into public.processing_logs(job_id,user_id,category,message) values(j.id,j.user_id,coalesce(p_category,'success'),coalesce(p_message,'Metadata retrieved and validated.'));
 return true;
end $$;

create function public.approve_import_progress(p_item uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.import_items;
begin
 select * into i from public.import_items where id=p_item and user_id=auth.uid();
 if i.id is null or i.verified_position is null then raise exception 'Verified chapter unavailable' using errcode='42501'; end if;
 update public.library_entries set last_read_chapter=greatest(last_read_chapter,i.verified_position-1) where id=i.entry_id and user_id=auth.uid();
end $$;
create function public.clear_metadata_override(p_entry uuid,p_field text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_field not in ('title','summary','rating','authors','author_links','fandoms','series','ao3_tags','relationship_tags','character_tags','additional_tags','publication_status','published_chapters','total_chapters','word_count') then raise exception 'Unknown metadata field'; end if;
 update public.library_entries set metadata_overrides=metadata_overrides-p_field where id=p_entry and user_id=auth.uid();
 if not found then raise exception 'Story unavailable' using errcode='42501'; end if;
end $$;
-- Explicit grants: browser roles cannot write the queue or forge adapter output/leases.
revoke all on function public.submit_import_urls(text[]),public.cancel_import_batch(uuid),public.retry_metadata_job(uuid),public.approve_import_progress(uuid),public.clear_metadata_override(uuid,text),public.claim_metadata_job(),public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.submit_import_urls(text[]),public.cancel_import_batch(uuid),public.retry_metadata_job(uuid),public.approve_import_progress(uuid),public.clear_metadata_override(uuid,text) to authenticated;
grant execute on function public.claim_metadata_job(),public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer) to service_role;
commit;
