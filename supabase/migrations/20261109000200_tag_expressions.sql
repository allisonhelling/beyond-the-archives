-- Category-agnostic OR-of-AND expressions. Legacy fields/defaults remain readable.
-- No hierarchy policy is enabled by this migration.
create function public.library_expression_tags(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
 with candidates as (
  select v,n,btrim(v #>> '{}',U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') tag
  from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]' end) with ordinality a(v,n)
 ) select coalesce(jsonb_agg(tag order by position),'[]') from (
  select distinct on (public.library_normalize(tag)) tag,n position from candidates
  where jsonb_typeof(v)='string' and tag<>'' and length(v #>> '{}')<=10000 and (v #>> '{}') !~ '[[:cntrl:]]'
  order by public.library_normalize(tag),n
 ) tags;
$$;
create function public.library_tag_expression_groups(f jsonb, key text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare expression jsonb:=f->'tagExpressions'->key; tags jsonb; groups jsonb;
begin
 if expression->>'mode'='custom' and jsonb_typeof(expression->'groups')='array' then
  select coalesce(jsonb_agg(g order by n),'[]') into groups from (
   select public.library_expression_tags(v) g,n from jsonb_array_elements(expression->'groups') with ordinality a(v,n)
  ) x where g<>'[]'::jsonb;
  return groups;
 elsif expression->>'mode' in ('any','all') and jsonb_typeof(expression->'tags')='array' then
  tags:=public.library_expression_tags(expression->'tags');
 else
  expression:=jsonb_build_object('mode',case when key='fandoms' then 'any' else 'all' end);
  tags:=case when key='fandoms' then coalesce(f->key,'[]') else to_jsonb(string_to_array(coalesce(f->>key,''),',')) end;
  if key<>'fandoms' then tags:=public.library_expression_tags(tags); end if;
 end if;
 if tags='[]'::jsonb then return '[]'; end if;
 if expression->>'mode'='all' then return jsonb_build_array(tags); end if;
 select jsonb_agg(jsonb_build_array(v) order by n) into groups from jsonb_array_elements(tags) with ordinality a(v,n);
 return groups;
end $$;
create function public.library_tag_groups_match(p_values jsonb, groups jsonb, category text, aliases jsonb) returns boolean
language sql immutable set search_path='' as $$
 select groups='[]'::jsonb or exists(
  select 1 from jsonb_array_elements(groups) g where g<>'[]'::jsonb and not exists(
   select 1 from jsonb_array_elements_text(g) term where not exists(
    select 1 from jsonb_array_elements_text(coalesce(p_values,'[]')) tag
    where case when category='fandoms' then tag=term
     else public.library_tag_matches(tag,category,public.library_normalize(term),aliases) end
   )
  )
 );
$$;
revoke all on function public.library_expression_tags(jsonb), public.library_tag_expression_groups(jsonb,text), public.library_tag_groups_match(jsonb,jsonb,text,jsonb) from public,anon;
grant execute on function public.library_expression_tags(jsonb), public.library_tag_expression_groups(jsonb,text), public.library_tag_groups_match(jsonb,jsonb,text,jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.library_filter(s jsonb, f jsonb, terms jsonb, p_search text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$begin
 return (
 select

 (not coalesce((f->>'excludeLaterSeries')::boolean,false)
  or s->>'id' like 'series:%'
  or (select coalesce(bool_or(coalesce(m->'position'='1'::jsonb,false)),
    not exists(select 1 from jsonb_array_elements_text(coalesce(s->'metadata'->'series','[]')) name where btrim(name)<>''))
   from jsonb_array_elements(coalesce(s->'metadata'->'series_memberships','[]')) m
   where m->>'url'='https://archiveofourown.org/series/'||(m->>'id')
    and case when jsonb_typeof(m->'id')='number' then
     (m->>'id')::numeric between 1 and 9007199254740991 and trunc((m->>'id')::numeric)=(m->>'id')::numeric
    else false end))
 and (coalesce(f->>'query','')='' or strpos(concat_ws(E'\n',coalesce(s->>'normalizedQueryText',public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]'))))),s->'work'->>'ao3_work_id'),public.library_normalize(trim(f->>'query')))>0)
 and public.library_tag_groups_match(s->'metadata'->'fandoms',coalesce(f->'tagGroups'->'fandoms',public.library_tag_expression_groups(f,'fandoms')),'fandoms',null)
 and (coalesce(f->'publication','[]')='[]'::jsonb or f->'publication' ? (s->'metadata'->>'publication_status'))
 and (coalesce(f->>'oneShot','allowed')='allowed' or coalesce(s->'oneShots',jsonb_build_array(public.library_one_shot(s->'metadata',coalesce(s->'personalTags','[]')))) @> jsonb_build_array(f->>'oneShot'='only'))
 and (coalesce(f->>'crossovers','allowed')='allowed' or coalesce(s->'crossovers',jsonb_build_array(public.library_crossover(s->'metadata'))) @> jsonb_build_array(f->>'crossovers'='only'))
 and (not coalesce((f->>'inSeries')::boolean,false) or coalesce(s->'metadata'->'series','[]')<>'[]'::jsonb or coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb)
 and (coalesce(f->'rating','[]')='[]'::jsonb or exists(select 1 from jsonb_array_elements_text(f->'rating') v where coalesce(s->'ratings',jsonb_build_array(s->'metadata'->>'rating')) ? v))
 and (not coalesce((f->>'favorites')::boolean,false) or (s->>'is_favorite')::boolean)
 and (not coalesce((f->>'personalNotes')::boolean,false) or coalesce(s->>'notes','') ~ '[^[:space:]]')
 and (not coalesce((f->>'recs')::boolean,false) or coalesce(s->'is_rec'='true'::jsonb,false))
 and (coalesce(f->'personalRating','[]')='[]'::jsonb or exists(
  select 1 from jsonb_array_elements(coalesce(nullif(s->'personalRatings','[]'::jsonb),jsonb_build_array(s->'personal_rating'))) rating
  where f->'personalRating' ? coalesce(rating #>> '{}','unrated')))
 and public.library_tag_groups_match(s->'metadata'->'relationship_tags',coalesce(f->'tagGroups'->'relationship',public.library_tag_expression_groups(f,'relationship')),'relationship_tags',f->'tagAliases')
 and public.library_tag_groups_match(s->'metadata'->'character_tags',coalesce(f->'tagGroups'->'characters',public.library_tag_expression_groups(f,'characters')),'character_tags',f->'tagAliases')
 and public.library_tag_groups_match(s->'metadata'->'additional_tags',coalesce(f->'tagGroups'->'tags',public.library_tag_expression_groups(f,'tags')),'additional_tags',f->'tagAliases')

 and not exists (
  select 1 from unnest(string_to_array(public.library_normalize(coalesce(f->>'personalTags','')),',')) term
  where trim(term)<>'' and not exists (
   select 1 from jsonb_array_elements_text(coalesce(s->'personalTags','[]')) tag
   where strpos(public.library_normalize(tag),trim(term))>0))
 and (coalesce(f->>'updatedAfter','')='' or (s->'work'->>'ao3_updated_at')::timestamptz >= ((f->>'updatedAfter')::date::timestamp at time zone 'UTC'))
 and (coalesce(f->>'updatedBefore','')='' or (s->'work'->>'ao3_updated_at')::timestamptz < (((f->>'updatedBefore')::date+1)::timestamp at time zone 'UTC'))
 and (terms is null or terms='[]'::jsonb or public.library_matches_normalized(coalesce(p_search,public.library_normalize(public.library_search_text(s,coalesce(f->>'scope','any'))||case when f->>'scope'='any' then coalesce(s->>'extraSearch','') else '' end)),terms)));
end;
$function$;

create or replace function public.library_alias_filters(f jsonb,p_owner uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare groups jsonb;
begin
 if f ? 'tagGroups' then return f; end if;
 if jsonb_typeof(f->'tagExpressions') is distinct from 'object' then f:=f-'tagExpressions'; end if;
 select jsonb_object_agg(key,public.library_tag_expression_groups(f,key)) into groups from unnest(array['fandoms','relationship','characters','tags']) key;
 f:=f||jsonb_build_object('tagGroups',groups);
 if f ? 'tagAliases' or (groups->'relationship'='[]'::jsonb and groups->'characters'='[]'::jsonb and groups->'tags'='[]'::jsonb) then return f; end if;
 return f||jsonb_build_object('tagAliases',public.library_tag_aliases(p_owner));
end $$;
CREATE OR REPLACE FUNCTION public.check_automatic_collection_rules(p_rules jsonb, p_default_key text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f jsonb; key text; value jsonb; group_value jsonb; term jsonb;
begin
 if p_rules is null then return; end if;
 f := p_rules->'filters';
 if p_default_key is not null or jsonb_typeof(p_rules)<>'object'
  or jsonb_typeof(f) is distinct from 'object'
  or jsonb_typeof(p_rules->'terms') is distinct from 'array'
  or octet_length(p_rules::text)>65536 then
  raise check_violation using message='Invalid automatic collection rules.';
 end if;
 for key,value in select * from jsonb_each(f) loop
  if key='tagExpressions' then
   if jsonb_typeof(value)<>'object' then raise check_violation using message='Invalid tag expressions.'; end if;
   for group_value,term in select to_jsonb(e.key),e.value from jsonb_each(value) e loop
    if group_value #>> '{}' not in ('fandoms','relationship','characters','tags') or jsonb_typeof(term)<>'object' or coalesce(term->>'mode','') not in ('any','all','custom')
     or (term->>'mode'='custom' and jsonb_typeof(term->'groups') is distinct from 'array')
     or (term->>'mode'<>'custom' and jsonb_typeof(term->'tags') is distinct from 'array') then
     raise check_violation using message='Invalid tag expression.';
    end if;
    if term->>'mode'='custom' then
     if exists(select 1 from jsonb_array_elements(term->'groups') g where jsonb_typeof(g)<>'array') then raise check_violation using message='Invalid tag group.'; end if;
     if exists(select 1 from jsonb_array_elements(term->'groups') g cross join lateral jsonb_array_elements(g) t where jsonb_typeof(t)<>'string') then raise check_violation using message='Invalid tag group value.'; end if;
    elsif exists(select 1 from jsonb_array_elements(term->'tags') t where jsonb_typeof(t)<>'string') then raise check_violation using message='Invalid tag value.';
    end if;
   end loop;
  elsif key in ('fandoms','publication','rating','personalRating') then
   if jsonb_typeof(value)<>'array' then raise check_violation using message='Invalid collection filter list.'; end if;
   if exists(select 1 from jsonb_array_elements(value) v where jsonb_typeof(v)<>'string') then raise check_violation using message='Invalid collection filter value.'; end if;
  elsif key in ('inSeries','favorites','personalNotes','recs','showSeries','excludeLaterSeries') then
   if jsonb_typeof(value)<>'boolean' then raise check_violation using message='Invalid collection filter flag.'; end if;
  elsif key in ('query','crossovers','oneShot','relationship','characters','tags','personalTags','updatedAfter','updatedBefore','within','scope','sort','groupBy') then
   if jsonb_typeof(value)<>'string' then raise check_violation using message='Invalid collection filter text.'; end if;
  else raise check_violation using message='Unknown collection filter.';
  end if;
 end loop;
 if coalesce(f->>'crossovers','allowed') not in ('allowed','only','exclude') or coalesce(f->>'scope','any') not in ('any','summary','notes') or coalesce(f->>'oneShot','allowed') not in ('allowed','only','exclude') then
  raise check_violation using message='Invalid collection filter option.';
 end if;
 foreach key in array array['updatedAfter','updatedBefore'] loop
  if coalesce(f->>key,'')<>'' then
   if f->>key !~ '^\d{4}-\d{2}-\d{2}$' then raise check_violation using message='Invalid collection filter date.'; end if;
   perform (f->>key)::date;
  end if;
 end loop;
 if coalesce(f->>'updatedAfter','')<>'' and coalesce(f->>'updatedBefore','')<>'' and (f->>'updatedAfter')::date>(f->>'updatedBefore')::date then
  raise check_violation using message='Invalid collection date range.';
 end if;
 for group_value in select * from jsonb_array_elements(p_rules->'terms') loop
  if jsonb_typeof(group_value)<>'array' then raise check_violation using message='Invalid collection search group.'; end if;
  for term in select * from jsonb_array_elements(group_value) loop
   if jsonb_typeof(term)<>'object' or jsonb_typeof(term->'parts') is distinct from 'array' or jsonb_typeof(term->'exclude') is distinct from 'boolean' then
    raise check_violation using message='Invalid collection search term.';
   end if;
   if exists(select 1 from jsonb_array_elements(term->'parts') v where jsonb_typeof(v)<>'string') then raise check_violation using message='Invalid collection search text.'; end if;
  end loop;
 end loop;
 return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.library_query_work_sql(p_query jsonb, p_reuse boolean DEFAULT false, p_sections boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare ordering text; filter_clause text:=''; filters jsonb:=coalesce(p_query->'filters','{}');
begin
  -- Default filters need no JSON documents at all during identity selection.
  if exists(select 1 from jsonb_each(coalesce(filters->'tagGroups','{}')) e where e.value<>'[]'::jsonb) or exists(select 1 from jsonb_each(case when jsonb_typeof(filters->'tagExpressions')='object' then filters->'tagExpressions' else '{}'::jsonb end) e where public.library_tag_expression_groups(filters,e.key)<>'[]'::jsonb) or coalesce(p_query->'terms','[]')<>'[]'::jsonb or exists(select 1 from jsonb_each(filters-array['sort','groupBy','scope','randomSeed','tagAliases','tagExpressions','tagGroups','showSeries','favorites','recs']) e
   where e.value not in ('""'::jsonb,'[]'::jsonb,'false'::jsonb) and not (e.key in ('oneShot','crossovers') and e.value='"allowed"')) then
   filter_clause:=$sql$ and public.library_filter(d.story,$1->'filters',$1->'terms',case $1->'filters'->>'scope' when 'summary' then d.search_summary when 'notes' then d.search_notes else d.search_any end)$sql$;
  end if;
  ordering:=case coalesce(filters->>'sort','added')
   when 'alpha' then 'sort_title,id' when 'alpha_reverse' then 'sort_title desc,id'
   when 'added' then 'sort_added desc nulls last,sort_title,id' when 'added_reverse' then 'sort_added asc nulls last,sort_title,id'
   when 'updated' then 'sort_updated desc nulls last,sort_title,id' when 'updated_reverse' then 'sort_updated asc nulls last,sort_title,id'
   when 'ready' then 'sort_ready desc nulls last,sort_title,id' when 'ready_reverse' then 'sort_ready asc nulls last,sort_title,id'
   when 'words' then 'sort_words desc nulls last,sort_title,id' when 'words_reverse' then 'sort_words asc nulls last,sort_title,id'
   when 'random' then 'public.library_shuffle_key(id::text,coalesce($1->''filters''->>''randomSeed'','''')),id'
   else 'sort_title,id' end;
  if p_reuse then filter_clause:=''; end if;
  return 'with filtered as not materialized (select d.id,d.sort_title,d.sort_added,d.sort_updated,d.sort_ready,d.sort_words,d.reading_sections from public.library_search_documents d where '||
   case when p_reuse then 'd.user_id=$2 and d.id in (select value::uuid from jsonb_array_elements_text($3))' else public.library_candidate_predicate(p_query) end||filter_clause||$sql$), selected as (
    select * from filtered where $1->>'mode'<>'reading' or $1->>'mode'='reading' and reading_sections @> array[case when coalesce($1->>'shelf','view_all') in ('complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading') then coalesce($1->>'shelf','view_all') else '_active' end]
   ), ordered as (select id from selected order by $sql$||ordering||$sql$)
   select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from ordered),'[]'),
    'sections',$sql$||case when p_reuse or p_sections then '$4' else $sql$case when $1->>'mode'='reading' then (
     select jsonb_object_agg(k,n) from (
      select k,count(f.id) n from unnest(array['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading']) k
      left join filtered f on f.reading_sections @> array[k] group by k
     ) counts) else '{}'::jsonb end$sql$ end||')';
end $function$;

-- Invalidate cached results and maintained memberships at the semantic boundary.
do $$ declare owner uuid; begin
 for owner in select user_id from public.library_query_state loop
  perform public.refresh_automatic_memberships(owner);
  perform public.invalidate_library_queries(owner);
 end loop;
end $$;

CREATE OR REPLACE FUNCTION public.library_tag_matches(p_tag text, p_category text, p_term text, p_aliases jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare category text:=case p_category when 'relationship_tags' then 'relationship' when 'character_tags' then 'character' when 'additional_tags' then 'freeform' else null end;
 names jsonb;
begin
 names:=p_aliases->category->p_term;
 if names is not null then return names ? public.library_normalize(p_tag); end if;
 return strpos(public.library_normalize(p_tag),p_term)>0;
end $function$;

CREATE OR REPLACE FUNCTION public.query_library(p_query jsonb DEFAULT '{}'::jsonb, p_page integer DEFAULT 1, p_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET jit TO 'off'
AS $function$

declare result jsonb; matches jsonb; attempt integer; expected_revision bigint; total bigint; pages integer; series_requested boolean;
begin
 if p_size not in (25,50,100,250) or p_page<1 then raise exception 'Invalid pagination' using errcode='22023'; end if;




 for attempt in 1..3 loop
 expected_revision:=public.library_revision();
 p_query:=jsonb_set(p_query,'{filters}',public.library_alias_filters(coalesce(p_query->'filters','{}')-array['tagAliases','tagGroups'],(select auth.uid())));
 series_requested:=public.library_query_has_series(p_query);
 if series_requested then
  matches:=public.library_query_series_matches(p_query,null,p_page,p_size)
   ||jsonb_build_object('revision',expected_revision);
 else matches:=public.library_query_matches(p_query); end if;
 total:=jsonb_array_length(matches->'ids'); pages:=greatest(1,ceil(total::numeric/p_size)::integer);
 series_requested:=public.library_query_has_series(p_query);
 with ids as materialized (
  select matches->'ids'->>i id,i+1 n
  from generate_series((least(p_page,pages)-1)*p_size,least(least(p_page,pages)*p_size,total::integer)-1) i
 ), page_entries as (
  select d.story s,null::jsonb payload,ids.n from ids join public.library_search_documents d on d.id=ids.id::uuid
   where not series_requested and d.user_id=(select auth.uid())
  union all
  select v->'s',nullif(v->'payload','null'::jsonb), (v->>'n')::bigint from jsonb_array_elements(matches->'entries') v where series_requested
 ), page as materialized (select s || case when payload is null then
  jsonb_build_object('automaticCollectionIds',public.automatic_collection_ids(s,(select auth.uid())))
  else '{}'::jsonb end s,payload,n from page_entries)
 select jsonb_build_object('revision',matches->'revision','total',total,'page',least(p_page,pages),'pages',pages,
 'stories',coalesce((select jsonb_agg(s-'normalizedSearchAny'-'normalizedSearchSummary'-'normalizedSearchNotes'-'normalizedQueryText'-'crossovers'-'queryText'-'oneShots'-'ratings'-'extraSearch'-'extension_metadata'-'extension_chapters'-'metadata_overrides'
 ||jsonb_build_object('metadata_overrides','{}'::jsonb,'work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at','verified_chapters',case when s->'work'->'verified_chapters' ? ((s->>'last_read_chapter')::integer+1)::text then jsonb_build_object(((s->>'last_read_chapter')::integer+1)::text,s->'work'->'verified_chapters'->((s->>'last_read_chapter')::integer+1)::text) else '{}'::jsonb end)) order by n) from page),'[]'),
 'series',coalesce((select jsonb_agg(payload||jsonb_build_object('record',nullif(payload->'record','null'::jsonb)-'metadata','savedStories',public.library_series_saved_stories(payload->'savedStories')) order by n) from page where payload is not null),'[]'),
 'sections',matches->'sections',
 'facets',case when coalesce((p_query->>'includeFacets')::boolean,true) then public.library_query_facets(p_query) else null end) into result;
 if (matches->>'revision')::bigint=expected_revision and expected_revision=coalesce(public.library_revision(),0) then
 return (result-'facets') || (coalesce(nullif(result->'facets','null'::jsonb),'{}'::jsonb)-'total');
 end if;
 end loop;
 raise exception 'Library changed while loading results' using errcode='40001';
end;
$function$;
