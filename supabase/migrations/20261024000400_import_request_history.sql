begin;
alter table public.import_batches add column sync_id uuid, add column source_url text;
create index import_batches_sync_request on public.import_batches(user_id,sync_id) where sync_id is not null;

-- Keep the page-sized import transaction and group only its history identity.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.submit_ao3_library_sync(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'submit_ao3_library_sync(p_rows jsonb)','submit_ao3_library_sync(p_rows jsonb, p_scan_id uuid default null, p_source_url text default null)');
 updated:=replace(updated,' return result;', $hook$
 if p_scan_id is not null and batch is not null then
  update public.import_batches set sync_id=p_scan_id,source_url=p_source_url where id=batch and user_id=auth.uid();
 end if;
 return result;$hook$);
 if updated=definition or updated not like '%set sync_id=p_scan_id%' then raise exception 'Review sync request history'; end if;
 drop function public.submit_ao3_library_sync(jsonb);
 execute updated;
end $$;
revoke all on function public.submit_ao3_library_sync(jsonb,uuid,text) from public,anon;
grant execute on function public.submit_ao3_library_sync(jsonb,uuid,text) to authenticated;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.paged_import_history(uuid,integer,integer,text)'::regprocedure) into definition;
 updated:=replace(definition,
  'with batches as materialized (select * from public.import_batches where user_id=(select auth.uid())),',
  $hook$with request_batches as materialized (select * from public.import_batches where user_id=(select auth.uid())),
 batches as materialized (select distinct on (coalesce(sync_id,id)) * from request_batches order by coalesce(sync_id,id),created_at,id),$hook$);
 updated:=replace(updated,
  'selected as (select coalesce(p_batch,(select id from batches order by created_at desc,id limit 1)) id),',
  $hook$selected as (select coalesce((select b.id from batches b join request_batches requested on coalesce(b.sync_id,b.id)=coalesce(requested.sync_id,requested.id) where requested.id=p_batch),(select id from batches order by created_at desc,id limit 1)) id),
 selected_batches as (select r.id from request_batches r join batches b on coalesce(r.sync_id,r.id)=coalesce(b.sync_id,b.id) where b.id=(select id from selected)),$hook$);
 updated:=replace(updated,'i.batch_id=b.id and user_id=', 'i.batch_id in(select id from selected_batches) and user_id=');
 updated:=replace(updated,'j.batch_id=b.id and user_id=', 'j.batch_id in(select id from selected_batches) and user_id=');
 updated:=replace(updated,'''batches'',coalesce', '''selectedBatch'',(select id from selected),''batches'',coalesce');
 updated:=replace(updated,'jsonb_agg(to_jsonb(i) order by ordinal,id) from page i',
  $hook$jsonb_agg(to_jsonb(i) || jsonb_build_object('work_info',case when i.status='completed' then (select jsonb_build_object('title',d.story->'metadata'->>'title','authors',d.story->'metadata'->'authors','author_links',d.story->'metadata'->'author_links') from public.library_search_documents d where d.id=i.entry_id and d.user_id=(select auth.uid())) end) order by ordinal,id) from page i$hook$);
 if updated=definition or updated not like '%selected_batches as%' or updated not like '%work_info%' then raise exception 'Review grouped import history'; end if;
 execute updated;
end $$;

-- Cancellation applies to every page of the selected request.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.cancel_import_batch(uuid)'::regprocedure) into definition;
 updated:=replace(definition,'declare active_until timestamptz;', 'declare active_until timestamptz; request_ids uuid[];');
 updated:=replace(updated,'begin', $hook$begin
 select array_agg(b.id) into request_ids from public.import_batches b join public.import_batches selected on coalesce(b.sync_id,b.id)=coalesce(selected.sync_id,selected.id) and b.user_id=selected.user_id where selected.id=p_batch and selected.user_id=auth.uid();$hook$);
 updated:=replace(updated,'where id=p_batch', 'where id=any(request_ids)');
 updated:=replace(updated,'where batch_id=p_batch', 'where batch_id=any(request_ids)');
 if updated=definition or updated not like '%request_ids uuid[]%' then raise exception 'Review request cancellation'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
