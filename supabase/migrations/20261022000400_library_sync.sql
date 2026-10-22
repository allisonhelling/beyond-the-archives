begin;
-- Reuse the CSV validation, per-work locks and private metadata path, forcing
-- Keep for all existing entries. Complete generated jobs in this transaction:
-- listing sync must never fan out into individual work-page requests.
create function public.submit_ao3_library_sync(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; safe_rows jsonb; batch uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>20000000 then raise exception 'Submit 1–2000 listing works'; end if;
 select jsonb_agg(value || jsonb_build_object('choice','keep','expectedVersion',null)) into safe_rows from jsonb_array_elements(p_rows);
 result:=public.submit_ao3_csv_import(safe_rows);
 batch:=(result->>'batch')::uuid;
 if batch is not null then
  update public.metadata_jobs set status='completed',completed_at=now(),retryable=false,lease_token=null,lease_until=null where batch_id=batch and user_id=auth.uid();
  update public.import_items set status='completed',metadata_status='completed',completed_at=now() where batch_id=batch and user_id=auth.uid();
 end if;
 return result;
end $$;
revoke all on function public.submit_ao3_library_sync(jsonb) from public,anon,authenticated;
grant execute on function public.submit_ao3_library_sync(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
