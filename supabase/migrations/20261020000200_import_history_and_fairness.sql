begin;
create function public.paged_import_history(p_batch uuid default null,p_history_page integer default 1,p_result_page integer default 1,p_status text default 'all') returns jsonb
language sql stable set search_path='' as $$
 with batches as materialized (select * from public.import_batches where user_id=(select auth.uid())),
 selected as (select coalesce(p_batch,(select id from batches order by created_at desc,id limit 1)) id),
 items as materialized (select i.* from public.import_items i,selected b where i.batch_id=b.id and user_id=(select auth.uid())),
 jobs as materialized (select j.* from public.metadata_jobs j,selected b where j.batch_id=b.id and user_id=(select auth.uid())),
 filtered as materialized (select * from items where p_status='all' or status=p_status or (p_status='review' and status in ('failed','skipped','cancelled'))),
 totals as (select (select count(*) from batches) batches,count(*) results,greatest(1,ceil(count(*)/50.0)::integer) pages from filtered),
 page as materialized (select * from filtered order by ordinal,id offset (select (greatest(1,least(p_result_page,pages))-1)*50 from totals) limit 50),
 history as materialized (select * from batches order by created_at desc,id offset greatest(0,p_history_page-1)*25 limit 25)
 select jsonb_build_object('batches',coalesce((select jsonb_agg(to_jsonb(b) order by created_at desc,id) from (select * from history union select * from batches where id=(select id from selected) and id not in(select id from history)) b),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by ordinal,id) from page i),'[]'),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from jobs j where entry_id in(select entry_id from page)),'[]'),
 'changes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'entry_id',entry_id,'status',status,'completed_at',completed_at,'last_attempt_at',last_attempt_at)) from jobs),'[]'),
 'summary',jsonb_build_object('total',(select count(*) from items),'filtered',results,'pages',pages,'page',greatest(1,least(p_result_page,pages)),
 'historyTotal',batches,'historyPages',greatest(1,ceil(batches/25.0)::integer),
 'active',exists(select 1 from jobs where status in ('pending','processing')) or exists(select 1 from items where status in ('pending','processing') or metadata_status in ('pending','processing')),
 'counts',(select jsonb_object_agg(k,(select count(*) from items where status=k)) from unnest(array['pending','processing','completed','failed','skipped','cancelled']) k),
 'imported',(select count(*) from items where result='imported' and status='completed'),
 'alreadySaved',(select count(*) from items where result='already_saved'),
 'completed',(select count(*) from items where status not in ('pending','processing')))) from totals;
$$;
revoke all on function public.paged_import_history(uuid,integer,integer,text) from public,anon;
grant execute on function public.paged_import_history(uuid,integer,integer,text) to authenticated;

-- Least recently served account/batch wins among eligible jobs. Selection still
-- holds the original global gate, per-user extension lock, leases and row locks.
create table public.metadata_queue_turns (
 user_id uuid not null references auth.users(id) on delete cascade,
 batch_id uuid not null references public.import_batches(id) on delete cascade,
 last_claimed_at timestamptz not null,
 primary key(user_id,batch_id)
);
alter table public.metadata_queue_turns enable row level security;
alter table public.metadata_queue_turns force row level security;
revoke all on public.metadata_queue_turns from public,anon,authenticated;
grant all on public.metadata_queue_turns to service_role;
do $$
declare name text; definition text; updated text;
begin
 foreach name in array array['claim_metadata_job','claim_extension_job'] loop
  select pg_get_functiondef(('public.'||name||'()')::regprocedure) into definition;
  updated:=replace(definition,'order by q.next_attempt_at,q.created_at for update of q skip locked limit 1;',
   $new$order by (select max(t.last_claimed_at) from public.metadata_queue_turns t where t.user_id=q.user_id) asc nulls first,
   (select t.last_claimed_at from public.metadata_queue_turns t where t.user_id=q.user_id and t.batch_id=q.batch_id) asc nulls first,
   q.next_attempt_at,q.created_at,q.attempts,(select min(i.ordinal) from public.import_items i where i.batch_id=q.batch_id and i.entry_id=q.entry_id),q.id for update of q skip locked limit 1;$new$);
  if updated=definition then raise exception 'Review queue fairness patch for %',name; end if;
  updated:=replace(updated,'if j.id is null then return null; end if;',
   $new$if j.id is null then return null; end if;
 insert into public.metadata_queue_turns(user_id,batch_id,last_claimed_at) values(j.user_id,j.batch_id,clock_timestamp())
 on conflict(user_id,batch_id) do update set last_claimed_at=excluded.last_claimed_at;$new$);
  execute updated;
 end loop;
end;
$$;
commit;
