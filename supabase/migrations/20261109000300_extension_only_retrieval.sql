begin;

-- Serialize cutover with old claims and completions. A worker already holding a live
-- lease may finish; no later claim can originate hosted retrieval.
lock table public.metadata_jobs in exclusive mode;
create or replace function public.claim_metadata_job() returns jsonb
language sql security definer set search_path='' as $$ select null::jsonb $$;
revoke all on function public.claim_metadata_job() from public,anon,authenticated;
grant execute on function public.claim_metadata_job() to service_role;

alter table public.metadata_jobs alter column retrieval_mode set default 'extension';
alter table public.metadata_preferences alter column retrieval_mode set default 'extension';

-- Old clients and restored preferences are harmless. Keep columns and terminal
-- direct job values readable for compatibility and auditing.
create function public.normalize_metadata_preferences() returns trigger
language plpgsql set search_path='' as $$
begin
 new.retrieval_mode:='extension';
 new.retrieval_mode_mobile:=null;
 return new;
end $$;
create trigger extension_only_preferences before insert or update on public.metadata_preferences
 for each row execute function public.normalize_metadata_preferences();
revoke all on function public.normalize_metadata_preferences() from public,anon,authenticated;
update public.metadata_preferences set retrieval_mode='extension',retrieval_mode_mobile=null;

create or replace function public.set_metadata_job_mode() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.status='pending' then
  if TG_OP='UPDATE' and old.retrieval_mode='direct' and new.retrieval_mode='direct' then
   insert into public.processing_logs(job_id,user_id,category,message)
    values(new.id,new.user_id,'extension_migration',format('Retired hosted retrieval: original mode direct, status %s, attempts %s. Retry uses the desktop companion.',old.status,old.attempts));
  end if;
  new.retrieval_mode:='extension';
  if TG_OP='INSERT' or old.retrieval_mode='direct' then
   new.error_message:='Waiting for the desktop companion. Open the app in Chrome/Edge and reconnect in Settings.';
  end if;
 end if;
 return new;
end $$;
drop trigger metadata_job_mode on public.metadata_jobs;
create trigger metadata_job_mode before insert or update of status,retrieval_mode on public.metadata_jobs
 for each row execute function public.set_metadata_job_mode();

-- Reuse this same transition at cutover and when an account reconnects after
-- an old worker lease expires. Row locks fence late results without resetting
-- a live worker or duplicating the original work, source URL or import item.
create function public.migrate_direct_metadata_jobs(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.metadata_jobs;
begin
 for j in select q.* from public.metadata_jobs q join public.import_batches b on b.id=q.batch_id
  where q.retrieval_mode='direct' and (p_user is null or q.user_id=p_user)
   and b.cancelled_at is null
   and (q.status='pending' or (q.status='processing' and (q.lease_until is null or q.lease_until<=now())))
  for update of q skip locked
 loop
  insert into public.processing_logs(job_id,user_id,category,message)
   values(j.id,j.user_id,'extension_migration',format('Retired hosted retrieval: original mode direct, status %s, attempts %s. Requeued for the desktop companion.',j.status,j.attempts));
  update public.metadata_jobs set retrieval_mode='extension',status='pending',
   attempts=least(attempts,3),lease_token=null,lease_until=null,completed_at=null,
   next_attempt_at=greatest(next_attempt_at,now()),retryable=true,error_category='extension_waiting',
   error_message='Waiting for the desktop companion. Open the app in Chrome/Edge and reconnect in Settings.'
   where id=j.id;
  update public.import_items set status=case when duplicate_of is null then 'pending' else 'skipped' end,
   metadata_status='pending',completed_at=null,error_category='extension_waiting',
   error_message='Hosted retrieval retired; waiting for the desktop companion.'
   where batch_id=j.batch_id and entry_id=j.entry_id;
 end loop;
end $$;
revoke all on function public.migrate_direct_metadata_jobs(uuid) from public,anon,authenticated;
select public.migrate_direct_metadata_jobs(null);

-- Extend the existing owner-scoped, fair, leased extension queue in place.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.claim_extension_job()'::regprocedure) into definition;
 updated:=replace(definition,'perform 1 from auth.users where id=auth.uid() for update;',
  'perform 1 from auth.users where id=auth.uid() for update;
 perform public.migrate_direct_metadata_jobs(auth.uid());
 if exists(select 1 from public.metadata_jobs where user_id=auth.uid() and retrieval_mode=''direct'' and status=''processing'' and lease_until>now()) then return null; end if;');
 if updated=definition then raise exception 'Review extension-only claim migration'; end if;
 execute updated;
end $$;
-- Apply count validation before either the legacy shared layer or private
-- browser observations. Extension HTTP ingestion still performs full schema
-- validation; this retains the SQL boundary for trusted result writers too.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,' select ao3_work_id into wid from public.works where id=j.work_id for update;',
 $body$ if p_metadata is not null then
  foreach k in array array['kudos','bookmark_count','comment_count','hits','word_count','published_chapters','total_chapters'] loop
   if p_metadata ? k and p_metadata->k<>'null'::jsonb then
    if jsonb_typeof(p_metadata->k)<>'number' or (p_metadata->>k)!~'^[0-9]+$' then raise exception 'Invalid % count',k using errcode='22023'; end if;
    if (p_metadata->>k)::numeric>2147483647 then raise exception 'Invalid % count',k using errcode='22023'; end if;
   end if;
  end loop;
 end if;
 select ao3_work_id into wid from public.works where id=j.work_id for update;$body$);
 if updated=definition then raise exception 'Review extension result validation'; end if;
 execute updated;
end $$;
-- Restore temporarily disables user triggers; normalize only the restored
-- account after triggers are re-enabled, through the same migration helper.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,' -- Include other readers whose shared metadata was restored.',
 ' update public.metadata_preferences set retrieval_mode=''extension'',retrieval_mode_mobile=null where user_id=p_user;
 perform public.migrate_direct_metadata_jobs(p_user);
 -- Include other readers whose shared metadata was restored.');
 if updated=definition then raise exception 'Review extension-only backup restoration'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
