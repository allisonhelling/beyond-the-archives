-- Preview traffic shares the hosted worker's global pacing and pause state.
create function public.reserve_series_preview() returns boolean
language plpgsql security definer set search_path=public as $$
declare gate public.metadata_worker_state;
begin
 select * into gate from public.metadata_worker_state where id=1 for update;
 if gate.id is null or gate.next_request_at>now() or gate.paused_until>now()
  or exists(select 1 from public.metadata_jobs where retrieval_mode='direct' and status='processing' and lease_until>=now()) then return false; end if;
 -- Reserve enough time for the bounded fetch, plus the normal request interval.
 update public.metadata_worker_state set next_request_at=now()+interval '35 seconds' where id=1;
 return true;
end $$;
create function public.pause_series_preview(p_seconds integer,p_reason text) returns void
language sql security definer set search_path=public as $$
 update public.metadata_worker_state set paused_until=greatest(paused_until,now()+make_interval(secs=>greatest(0,p_seconds))),reason=p_reason where id=1;
$$;
revoke all on function public.reserve_series_preview(),public.pause_series_preview(integer,text) from public,anon,authenticated;
grant execute on function public.reserve_series_preview(),public.pause_series_preview(integer,text) to service_role;
