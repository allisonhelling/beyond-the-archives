begin;

-- Keep scalar join keys beside saved documents. Hashing and sorting must not
-- repeatedly extract keys from the large JSON values carried through the CTEs.
-- Candidate series already have one private record per owner and AO3 identity;
-- join that record after deduplicating identities instead of serializing both
-- copies of its preview through max(text) and parsing them back into JSON.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_results(jsonb,boolean)'::regprocedure) into definition;
 updated:=replace(definition,
  'select value s, value->''metadata'' m from jsonb_array_elements(p_stories)',
  'select value s, value->''metadata'' m, value->>''id'' entry_id, value->''work''->>''ao3_work_id'' work_id from jsonb_array_elements(p_stories)');
 updated:=replace(updated,
  'join saved on s->''work''->>''ao3_work_id''=w->>''workId''',
  'join saved on saved.work_id=w->>''workId''');
 updated:=replace(updated,
  'from saved join linked l on l.id=s->>''id'' group by l.sid',
  'from saved join linked l on l.id=saved.entry_id group by l.sid');
 updated:=replace(updated,
 $old$groups as materialized (select c.*,coalesce(g.saved,'[]'::jsonb) saved from (
 select c.sid,coalesce(max(r.metadata->>'title'),min(c.title)) title,max(r.record::text)::jsonb record,max(r.metadata::text)::jsonb preview
 from candidates c left join records r on r.ao3_series_id=c.sid group by c.sid) c
 left join saved_groups g on g.sid=c.sid),$old$,
 $new$candidate_ids as materialized (select sid,min(title) title from candidates group by sid),
 groups as materialized (
 select c.sid,coalesce(r.metadata->>'title',c.title) title,r.record,r.metadata preview,coalesce(g.saved,'[]'::jsonb) saved
 from candidate_ids c left join records r on r.ao3_series_id=c.sid
 left join saved_groups g on g.sid=c.sid),$new$);
 if updated=definition or updated like '%max(r.record::text)%' or updated not like '%saved.entry_id%' then
  raise exception 'Review relational series grouping';
 end if;
 execute updated;
end $$;
-- Keep the saved-work page contract in one place, whether the page consumes a
-- legacy full payload or the compact browsing overload below.
create function public.library_series_saved_stories(p_saved jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','personal_rating',v->'personal_rating','reading_status',v->'reading_status','last_read_chapter',v->'last_read_chapter','work',jsonb_build_object('id',v->'work'->'id','ao3_work_id',v->'work'->'ao3_work_id'))),'[]')
 from jsonb_array_elements(p_saved) v;
$$;
revoke all on function public.library_series_saved_stories(jsonb) from public,anon;
grant execute on function public.library_series_saved_stories(jsonb) to authenticated;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_results(jsonb,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'library_series_results(p_stories jsonb, p_navigation boolean)',
  'library_series_results(p_stories jsonb, p_navigation boolean, p_compact boolean, p_payload boolean)');
 updated:=replace(updated,'to_jsonb(r)||jsonb_build_object(',
  $new$(case when p_compact then jsonb_build_object('id',r.id,'user_id',r.user_id,'ao3_series_id',r.ao3_series_id,'notes',r.notes,'created_at',r.created_at,'updated_at',r.updated_at,'is_favorite',r.is_favorite,'reading_status',r.reading_status,'is_rec',r.is_rec) else to_jsonb(r) end)||jsonb_build_object($new$);
 updated:=replace(updated,$old$'record',record,'savedStories',saved,$old$,
  $new$'record',record,'savedStories',case when p_compact then public.library_series_saved_stories(saved) else saved end,$new$);
 updated:=replace(updated,'case when p_navigation then null::jsonb else','case when p_navigation or not p_payload then null::jsonb else');
 if updated=definition or updated not like '%p_payload boolean%' or updated not like '%public.library_series_saved_stories(saved)%' then
  raise exception 'Review compact series browsing payload';
 end if;
 execute updated;
end $$;

-- Keep the full merger API for detail/navigation callers. Browsing opts into
-- compact saved work/record fields before materialization and pagination.
create or replace function public.library_series_results(p_stories jsonb,p_navigation boolean)
returns table(story jsonb,payload jsonb) language sql stable set search_path='' as $$
 select * from public.library_series_results(p_stories,p_navigation,false,true);
$$;
revoke all on function public.library_series_results(jsonb,boolean,boolean,boolean) from public,anon;
grant execute on function public.library_series_results(jsonb,boolean,boolean,boolean) to authenticated;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'library_query_pool(p_query jsonb)','library_query_pool(p_query jsonb, p_payload boolean)');
 updated:=replace(updated,
  $old$public.library_series_results(coalesce((select jsonb_agg(s) from series_inputs),'[]'))$old$,
  $new$public.library_series_results(coalesce((select jsonb_agg(s) from series_inputs),'[]'),false,true,p_payload)$new$);
 if updated=definition or updated not like '%p_payload boolean%' then raise exception 'Review compact series pool'; end if;
 execute updated;

 select pg_get_functiondef('public.library_query_facets(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'select * from public.library_query_pool(p_query)',
  $new$select jsonb_build_object('personalTags',s->'personalTags','metadata',jsonb_build_object('relationship_tags',s->'metadata'->'relationship_tags','character_tags',s->'metadata'->'character_tags','additional_tags',s->'metadata'->'additional_tags','fandoms',s->'metadata'->'fandoms')) s from public.library_query_pool(p_query,false)$new$);
 if updated=definition then raise exception 'Review compact series facets'; end if;
 execute updated;

 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$(select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','personal_rating',v->'personal_rating','reading_status',v->'reading_status','last_read_chapter',v->'last_read_chapter','work',jsonb_build_object('id',v->'work'->'id','ao3_work_id',v->'work'->'ao3_work_id'))),'[]') from jsonb_array_elements(payload->'savedStories') v)$old$,
  $new$public.library_series_saved_stories(payload->'savedStories')$new$);
 if updated=definition then raise exception 'Review shared series page projection'; end if;
 execute updated;
end $$;
create or replace function public.library_query_pool(p_query jsonb)
returns table(s jsonb,payload jsonb,search_any text,search_summary text,search_notes text)
language sql stable set search_path='' set jit=off as $$
 select * from public.library_query_pool(p_query,true);
$$;
revoke all on function public.library_query_pool(jsonb,boolean) from public,anon;
grant execute on function public.library_query_pool(jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
