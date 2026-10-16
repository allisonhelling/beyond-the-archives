begin;
create table public.metadata_preferences (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 retrieval_mode text not null default 'direct' check(retrieval_mode in ('direct','extension'))
);
alter table public.metadata_preferences enable row level security;
alter table public.metadata_preferences force row level security;
revoke all on public.metadata_preferences from public,anon,authenticated;
grant select,insert,update on public.metadata_preferences to authenticated;
grant all on public.metadata_preferences to service_role;
create policy owner_preferences on public.metadata_preferences to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

alter table public.library_entries add column extension_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(extension_metadata)='object');
alter table public.library_entries add column extension_chapters jsonb not null default '{}'::jsonb check(jsonb_typeof(extension_chapters)='object');
alter table public.metadata_jobs add column retrieval_mode text not null default 'direct' check(retrieval_mode in ('direct','extension'));
create function public.set_metadata_job_mode() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.retrieval_mode:=coalesce((select retrieval_mode from public.metadata_preferences where user_id=new.user_id),'direct');
 if new.retrieval_mode='extension' then new.error_message:='Waiting for the browser extension. Connect it in Settings; finish any AO3 confirmation in the opened tab.'; end if;
 return new;
end $$;
create trigger metadata_job_mode before insert on public.metadata_jobs for each row execute function public.set_metadata_job_mode();
revoke all on function public.set_metadata_job_mode() from public,anon,authenticated;

-- Keep the established queue, fencing tokens, cancellation, result history and
-- direct worker. Browser jobs never enter the direct worker's traffic gate.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.claim_metadata_job()'::regprocedure) into definition;
 updated:=replace(definition, $old$where status='processing' and lease_until<now() and attempts>=4$old$, $new$where retrieval_mode='direct' and status='processing' and lease_until<now() and attempts>=4$new$);
 updated:=replace(updated, $old$where status='processing' and lease_until>=now()$old$, $new$where retrieval_mode='direct' and status='processing' and lease_until>=now()$new$);
 updated:=replace(updated, 'where b.cancelled_at is null and q.attempts<4', 'where q.retrieval_mode=''direct'' and b.cancelled_at is null and q.attempts<4');
 if updated=definition or updated not like '%q.retrieval_mode=''direct''%' then raise exception 'Review direct worker extension'; end if;
 execute updated;

 select pg_get_functiondef('public.cancel_import_batch(uuid)'::regprocedure) into definition;
 updated:=replace(definition, $old$where batch_id=p_batch and status='processing';$old$, $new$where batch_id=p_batch and status='processing' and retrieval_mode='direct';$new$);
 if updated=definition then raise exception 'Review cancellation traffic gate'; end if;
 execute updated;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, $old$ if p_metadata is not null then$old$, $new$
 if p_metadata is not null and (j.retrieval_mode='extension' or exists(select 1 from public.library_entries where id=j.entry_id and extension_metadata<>'{}'::jsonb)) then
  if jsonb_typeof(p_metadata)<>'object' or jsonb_typeof(p_chapters)<>'object' then raise exception 'Invalid extension result'; end if;
  -- User-controlled browser snapshots stay private; manual overrides remain on top.
  update public.library_entries set extension_metadata=extension_metadata || p_metadata || jsonb_build_object('last_metadata_success',now(),'last_metadata_check',now()),
   extension_chapters=case when p_chapters<>'{}'::jsonb then p_chapters else extension_chapters end
   where id=j.entry_id and user_id=j.user_id;
  update public.library_entries e set extension_metadata=jsonb_set(e.extension_metadata,'{total_chapters}','null'::jsonb)
   from public.works w where e.id=j.entry_id and w.id=j.work_id
    and coalesce((e.extension_metadata->>'published_chapters')::integer,w.published_chapters)>
     case when e.extension_metadata ? 'total_chapters' then (e.extension_metadata->>'total_chapters')::integer else w.total_chapters end;
 end if;
 if p_metadata is not null and j.retrieval_mode='extension' then
  update public.import_items i set verified_position=(select key::integer from jsonb_each_text(p_chapters) where value=i.chapter_id limit 1)
   where i.batch_id=j.batch_id and i.ao3_work_id=wid;
  -- A page visit never sets reading progress, including a chapter import.
 elsif p_metadata is not null then$new$);
 updated:=replace(updated, $old$update public.works set last_metadata_check=now() where id=j.work_id;$old$, $new$update public.works set last_metadata_check=now() where id=j.work_id and j.retrieval_mode='direct';$new$);
 updated:=replace(updated, $old$('blocked','rate_limited')$old$, $new$('blocked','rate_limited','extension_waiting','extension_error')$new$);
 if updated=definition or updated not like '%elsif p_metadata is not null then%' then raise exception 'Review extension commit boundary'; end if;
 execute updated;
end $$;

-- Only authenticated, explicitly submitted jobs can be claimed by an extension.
create function public.claim_extension_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.metadata_jobs; token uuid:=gen_random_uuid(); wid bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Serialize claims per account, including multiple tabs/extensions.
 perform 1 from auth.users where id=auth.uid() for update;
 update public.metadata_jobs set status='failed',retryable=false,completed_at=now(),error_category='extension_error',error_message='Browser request expired; maximum attempts reached.'
  where user_id=auth.uid() and retrieval_mode='extension' and status='processing' and lease_until<now() and attempts>=4;
 update public.import_items i set status=case when duplicate_of is null then 'failed' else 'skipped' end,metadata_status='failed',error_category='extension_error',error_message=expired.error_message,completed_at=now()
  from public.metadata_jobs expired where expired.user_id=auth.uid() and expired.retrieval_mode='extension' and expired.status='failed' and expired.error_category='extension_error' and expired.batch_id=i.batch_id and expired.entry_id=i.entry_id;
 if exists(select 1 from public.metadata_jobs where user_id=auth.uid() and retrieval_mode='extension' and status='processing' and lease_until>=now()) then return null; end if;
 select q.* into j from public.metadata_jobs q join public.import_batches b on b.id=q.batch_id
  where q.user_id=auth.uid() and q.retrieval_mode='extension' and b.cancelled_at is null and q.attempts<4
   and ((q.status='pending' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<now()))
  order by q.next_attempt_at,q.created_at for update of q skip locked limit 1;
 if j.id is null then return null; end if;
 update public.metadata_jobs set status='processing',attempts=attempts+1,lease_token=token,lease_until=now()+interval '5 minutes',last_attempt_at=now(),error_category='extension_waiting',error_message='Waiting for the requested AO3 page. Complete sign-in or confirmation in your browser if needed.' where id=j.id;
 update public.library_entries set extension_metadata=jsonb_set(extension_metadata,'{last_metadata_check}',to_jsonb(now())) where id=j.entry_id and user_id=auth.uid();
 update public.import_items set status=case when duplicate_of is null then 'processing' else 'skipped' end,metadata_status='processing',last_attempt_at=now() where batch_id=j.batch_id and entry_id=j.entry_id;
 insert into public.processing_logs(job_id,user_id,category,message) values(j.id,j.user_id,'extension_waiting','Browser extension acquired a five-minute lease for an app-requested work.');
 select ao3_work_id into wid from public.works where id=j.work_id;
 return jsonb_build_object('id',j.id,'token',token,'workId',wid,'expiresAt',now()+interval '5 minutes');
end $$;
revoke all on function public.claim_extension_job() from public,anon;
grant execute on function public.claim_extension_job() to authenticated;
commit;
