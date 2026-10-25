begin;

-- A scan spans many page-sized import batches; retain its report independently
-- of extension checkpoints, which are deleted after a successful import.
create table public.library_sync_reports (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null,
 completed_at timestamptz not null default now(),
 report jsonb not null check (jsonb_typeof(report)='object'),
 primary key (user_id,id)
);
create index library_sync_reports_recent on public.library_sync_reports(user_id,completed_at desc,id);
alter table public.library_sync_reports enable row level security;
create policy library_sync_reports_owner on public.library_sync_reports to authenticated
 using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update on public.library_sync_reports to authenticated;

create function public.library_sync_report_history(p_report jsonb default null,p_page integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare reports jsonb; total integer;
begin
 if auth.uid() is null then raise exception 'Sign in to view sync reports' using errcode='42501'; end if;
 if p_page is null or p_page<1 then raise exception 'Invalid report page' using errcode='22023'; end if;
 if p_report is not null then
  if jsonb_typeof(p_report) is distinct from 'object' or p_report->>'status' is distinct from 'complete'
   or p_report->>'id' is null or coalesce(p_report->>'url','') !~ '^https://archiveofourown[.]org/'
   or jsonb_typeof(p_report->'pages') is distinct from 'number'
   or jsonb_typeof(p_report->'count') is distinct from 'number'
   or jsonb_typeof(p_report->'skipped') is distinct from 'number' then
   raise exception 'Invalid sync report' using errcode='22023';
  end if;
  insert into public.library_sync_reports(id,report) values((p_report->>'id')::uuid,p_report)
   on conflict(user_id,id) do update set report=excluded.report;
 end if;
 select count(*) into total from public.library_sync_reports;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.completed_at desc,r.id),'[]'::jsonb) into reports
 from (select id,completed_at,report from public.library_sync_reports order by completed_at desc,id limit 10 offset (p_page-1)::bigint*10) r;
 return jsonb_build_object('reports',reports,'total',total);
end $$;
revoke all on function public.library_sync_report_history(jsonb,integer) from public,anon;
grant execute on function public.library_sync_report_history(jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
