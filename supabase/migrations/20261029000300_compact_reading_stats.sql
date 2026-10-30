begin;
-- Reuse effective, owner-scoped work documents without loading library relations.
create function public.reading_stats_works(p_after uuid default null, p_limit integer default 500)
returns jsonb language plpgsql stable set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'Invalid statistics page size'; end if;
 with source as (
  select d.id,d.story,false archived from public.library_search_documents d
   where d.user_id=owner_id and (p_after is null or d.id>p_after)
  union all
  select r.id,jsonb_build_object('id',r.id,'created_at',r.created_at,'reading_status',r.reading_status,'reading_history',r.reading_history,'metadata',r.metadata,'original_url',r.original_url,'work',jsonb_build_object('ao3_work_id',r.ao3_work_id)),true
  from public.reading_records r where r.user_id=owner_id and (p_after is null or r.id>p_after)
   and not exists(select 1 from public.library_entries e where e.id=r.id and e.user_id=owner_id)
 ), page as (select * from source order by id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'key',coalesce('ao3:'||nullif(story->'work'->>'ao3_work_id',''),nullif(story->>'original_url',''),id::text),
  'created_at',story->'created_at','reading_status',story->'reading_status','reading_history',coalesce(story->'reading_history','[]'::jsonb),
  'personal_rating',case when archived then 'null'::jsonb else story->'personal_rating' end,'archived',archived,
  'metadata',coalesce(story->'metadata','{}'::jsonb)-array['summary','summary_html','author_links','manual_url','bookfusion_link','series','series_memberships','ao3_tags']
 ) order by id),'[]'::jsonb) into result from page;
 return result;
end $$;
revoke all on function public.reading_stats_works(uuid,integer) from public,anon;
grant execute on function public.reading_stats_works(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
