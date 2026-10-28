begin;

-- Join saved works to their series once, rather than scanning all saved JSON
-- documents again for every series. Preserve the existing ID ordering and UNION
-- deduplication of inferred and explicit memberships.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_series_results(jsonb,boolean)'::regprocedure) into definition;
 updated:=replace(definition,
 $old$ groups as materialized (select c.sid,coalesce(max(r.metadata->>'title'),min(c.title)) title,max(r.record::text)::jsonb record,max(r.metadata::text)::jsonb preview,
 coalesce((select jsonb_agg(s order by s->>'id') from saved join linked l on l.id=s->>'id' where l.sid=c.sid),'[]') saved
 from candidates c left join records r on r.ao3_series_id=c.sid group by c.sid),$old$,
 $new$ saved_groups as materialized (
 select l.sid,jsonb_agg(s order by s->>'id') saved
 from saved join linked l on l.id=s->>'id' group by l.sid),
 groups as materialized (select c.*,coalesce(g.saved,'[]'::jsonb) saved from (
 select c.sid,coalesce(max(r.metadata->>'title'),min(c.title)) title,max(r.record::text)::jsonb record,max(r.metadata::text)::jsonb preview
 from candidates c left join records r on r.ao3_series_id=c.sid group by c.sid) c
 left join saved_groups g on g.sid=c.sid),$new$);
 if updated=definition then raise exception 'Review grouped series inputs'; end if;
 execute updated;
end $$;

-- The series merger consumes effective metadata and a small set of reading
-- fields. Raw source overlays, HTML summaries, chapter maps and duplicate work
-- metadata are not used by series filters/cards or the compact savedStories API.
-- Keep raw overlays out of the aggregate passed to the merger.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=definition;
 updated:=replace(updated,'select jsonb_agg(s) from works where series_requested',
 $new$select jsonb_agg(jsonb_build_object('id',s->'id','created_at',s->'created_at','personal_rating',s->'personal_rating','reading_status',s->'reading_status','last_read_chapter',s->'last_read_chapter','notes',s->'notes','personalTags',s->'personalTags','metadata',(s->'metadata')-'summary_html','work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at'))) from works where series_requested$new$);
 if updated=definition or updated not like '%''metadata'',(s->''metadata'')-''summary_html''%' then
  raise exception 'Review compact series work projection';
 end if;
 execute updated;
end $$;

-- Extend the existing matching pipeline with optional page projection. The
-- two-argument API keeps its identity-only result and reuse behavior.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_series_matches(jsonb,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
 'library_query_series_matches(p_query jsonb, p_ids jsonb DEFAULT NULL::jsonb)',
 'library_query_series_matches(p_query jsonb, p_ids jsonb, p_page integer, p_size integer)');
 updated:=replace(updated,
 $old$select jsonb_build_object('ids',coalesce(jsonb_agg(s->>'id' order by n),'[]'),'sections','{}'::jsonb) from ordered;$old$,
 $new$select jsonb_build_object('ids',coalesce(jsonb_agg(s->>'id' order by n),'[]'),'sections','{}'::jsonb)
 ||case when p_page is null then '{}'::jsonb else jsonb_build_object('entries',(
 select coalesce(jsonb_agg(jsonb_build_object('s',s,'payload',payload,'n',n) order by n),'[]') from ordered
 where n>(least(p_page,greatest(1,ceil((select count(*) from ordered)::numeric/p_size)::integer))-1)*p_size
 and n<=least(p_page,greatest(1,ceil((select count(*) from ordered)::numeric/p_size)::integer))*p_size)) end from ordered;$new$);
 if updated=definition or updated not like '%p_page integer%' or updated not like '%''entries''%' then raise exception 'Review single-pass series selection'; end if;
 execute updated;
end $$;

create or replace function public.library_query_series_matches(p_query jsonb,p_ids jsonb default null) returns jsonb
language sql stable set search_path='' set jit=off as $$
 select public.library_query_series_matches(p_query,p_ids,null,null);
$$;

-- A series page always needs merged cards, including when identity matching is
-- cached. Select and hydrate together instead of rebuilding the entire pool.
-- Work-only pages retain the existing revision-bound identity cache.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition,'matches:=public.library_query_matches(p_query);',
 $new$series_requested:=public.library_query_has_series(p_query);
 if series_requested then
  matches:=public.library_query_series_matches(p_query,null,p_page,p_size)
   ||jsonb_build_object('revision',expected_revision);
 else matches:=public.library_query_matches(p_query); end if;$new$);
 updated:=replace(updated,
 $old$select p.s,p.payload,ids.n from public.library_query_pool(p_query) p join ids on ids.id=p.s->>'id' where series_requested$old$,
 $new$select v->'s',nullif(v->'payload','null'::jsonb), (v->>'n')::bigint from jsonb_array_elements(matches->'entries') v where series_requested$new$);
 if updated=definition or updated not like '%matches->''entries''%' then raise exception 'Review single-pass series hydration'; end if;
 execute updated;
end $$;
revoke all on function public.library_query_series_matches(jsonb,jsonb,integer,integer) from public,anon;
grant execute on function public.library_query_series_matches(jsonb,jsonb,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
