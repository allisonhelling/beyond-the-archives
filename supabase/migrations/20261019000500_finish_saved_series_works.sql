-- Finishing a series updates only existing entries. Never import missing works.
begin;
create or replace function public.finish_library_series(p_series bigint) returns integer
language plpgsql security definer set search_path='' as $$
declare saved public.library_series; affected integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series for update;
 if not found then raise exception 'Load the series details first' using errcode='22023'; end if;
 -- Include owned memberships even if a restricted work disappeared from AO3's listing.
 update public.library_entries e set reading_status='finished',last_read_chapter=greatest(e.last_read_chapter,coalesce(
  case when coalesce(e.metadata_overrides->>'published_chapters',e.extension_metadata->>'published_chapters') ~ '^[0-9]{1,9}$' then coalesce(e.metadata_overrides->>'published_chapters',e.extension_metadata->>'published_chapters')::integer end,w.published_chapters,
  (select case when value->>'chapters' ~ '^[0-9]{1,9}/' then split_part(value->>'chapters','/',1)::integer end from jsonb_array_elements(saved.metadata->'works') where (value->>'workId')::bigint=w.ao3_work_id limit 1),e.last_read_chapter))
 from public.works w where e.work_id=w.id and e.user_id=auth.uid() and (
  exists(select 1 from jsonb_array_elements(saved.metadata->'works') where (value->>'workId')::bigint=w.ao3_work_id)
  or coalesce(e.metadata_overrides->'series_memberships',e.extension_metadata->'series_memberships',w.automatic_metadata->'series_memberships','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',p_series)));
 get diagnostics affected=row_count;
 update public.library_series set reading_status='finished' where id=saved.id;
 return affected;
end;
$$;
commit;
