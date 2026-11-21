-- Apply the new filters to complete result sets and automatic collection memberships.
create function public.library_range_bounds_valid(field text, bounds jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare lower_bound text:=bounds->>'min'; upper_bound text:=bounds->>'max'; bound text;
begin
 if jsonb_typeof(bounds) is distinct from 'object' or bounds-array['min','max']<>'{}'::jsonb then return false; end if;
 if field not in ('word_count','published_chapters','kudos','bookmark_count','comment_count','hits','published','updated','imported') then return false; end if;
 if exists(select 1 from jsonb_each(bounds) e where jsonb_typeof(e.value)<>'string') then return false; end if;
 foreach bound in array array[lower_bound,upper_bound] loop
  if coalesce(bound,'')='' then continue; end if;
  if field in ('published','updated','imported') then
   if bound !~ '^\d{4}-\d{2}-\d{2}$' or not pg_input_is_valid(bound,'date') then return false; end if;
  elsif bound !~ '^\d+$' or length(bound)>64 then return false;
  elsif bound::numeric>9007199254740991 then return false;
  end if;
 end loop;
 if coalesce(lower_bound,'')='' or coalesce(upper_bound,'')='' then return true; end if;
 if field in ('published','updated','imported') then return lower_bound <= upper_bound; end if;
 return lower_bound::numeric <= upper_bound::numeric;
end $$;

create function public.library_ranges_match(s jsonb, ranges jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare field text; bounds jsonb; date_text text; day text; value_number numeric; lo text; hi text;
begin
 if ranges is null then return true; end if;
 if jsonb_typeof(ranges)<>'object' then return false; end if;
 for field,bounds in select * from jsonb_each(ranges) loop
  if not public.library_range_bounds_valid(field,bounds) then return false; end if;
  lo:=nullif(bounds->>'min',''); hi:=nullif(bounds->>'max','');
  if lo is null and hi is null then continue; end if;
  if field in ('published','updated','imported') then
   date_text:=case field when 'published' then s->'work'->>'ao3_published_at' when 'updated' then s->'work'->>'ao3_updated_at' else s->>'created_at' end;
   if coalesce(date_text,'')='' then return false; end if;
   day:=to_char(date_text::timestamptz at time zone 'UTC','YYYY-MM-DD');
   if (lo is not null and day<lo) or (hi is not null and day>hi) then return false; end if;
  else
   if jsonb_typeof(s->'metadata'->field) is distinct from 'number' then return false; end if;
   value_number:=(s->'metadata'->>field)::numeric;
   if (lo is not null and value_number<lo::numeric) or (hi is not null and value_number>hi::numeric) then return false; end if;
  end if;
 end loop;
 return true;
end $$;

create function public.library_excluded_tags_match(s jsonb, f jsonb) returns boolean
language sql immutable set search_path='' as $$
 select not exists (
  select 1 from (values ('relationship','relationship_tags'),('characters','character_tags'),('tags','additional_tags'),('personalTags','personalTags')) k(key,category)
  cross join lateral (select f->'excludedTags'->k.key expression) e
  cross join lateral (select public.library_expression_tags(e.expression->'tags') tags) t
  where t.tags<>'[]'::jsonb and public.library_tag_groups_match(
   case when k.key='personalTags' then s->'personalTags' else s->'metadata'->k.category end,
   case when e.expression->>'mode'='all' then jsonb_build_array(t.tags)
     else (select jsonb_agg(jsonb_build_array(tag)) from jsonb_array_elements(t.tags) tag) end,
   k.category, case when s->>'source_url' is null and k.key<>'personalTags' then f->'tagAliases' end
  )
 );
$$;

revoke all on function public.library_range_bounds_valid(text,jsonb), public.library_ranges_match(jsonb,jsonb), public.library_excluded_tags_match(jsonb,jsonb) from public,anon;
grant execute on function public.library_range_bounds_valid(text,jsonb), public.library_ranges_match(jsonb,jsonb), public.library_excluded_tags_match(jsonb,jsonb) to authenticated,service_role;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition,' return (',$new$ return
  (coalesce(f->'ranges','{}')='{}'::jsonb or public.library_ranges_match(s,f->'ranges'))
  and (coalesce(f->'excludedTags','{}')='{}'::jsonb or public.library_excluded_tags_match(s,f))
  and ($new$);
 updated:=replace(updated,$old$and (coalesce(f->>'updatedAfter','')=''$old$,
  $new$and (coalesce(f->'ranges'->'updated'->>'min','')<>'' or coalesce(f->>'updatedAfter','')=''$new$);
 updated:=replace(updated,$old$and (coalesce(f->>'updatedBefore','')=''$old$,
  $new$and (coalesce(f->'ranges'->'updated'->>'max','')<>'' or coalesce(f->>'updatedBefore','')=''$new$);
 if updated=definition then raise exception 'Review library range and tag exclusion filters'; end if;
 execute updated;

 select pg_get_functiondef('public.library_alias_filters(jsonb,uuid)'::regprocedure) into definition;
 updated:=replace(definition,$old$groups->'tags'='[]'::jsonb)$old$,
  $new$groups->'tags'='[]'::jsonb and not (coalesce(f->'excludedTags','{}') ?| array['relationship','characters','tags']))$new$);
 if updated=definition then raise exception 'Review aliases for excluded tags'; end if;
 execute updated;

 select pg_get_functiondef('public.library_query_work_sql(jsonb,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,$old$e.value not in ('""'::jsonb,'[]'::jsonb,'false'::jsonb)$old$,
  $new$e.value not in ('""'::jsonb,'[]'::jsonb,'false'::jsonb,'{}'::jsonb)$new$);
 if updated=definition then raise exception 'Review empty range and exclusion defaults'; end if;
 execute updated;

 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition,$old$  if key='tagExpressions' then$old$,$new$  if key='ranges' then
   if jsonb_typeof(value)<>'object' then raise check_violation using message='Invalid collection filter ranges.'; end if;
   if exists(select 1 from jsonb_each(value) e where not public.library_range_bounds_valid(e.key,e.value)) then
    raise check_violation using message='Invalid collection filter range.';
   end if;
  elsif key='excludedTags' then
   if jsonb_typeof(value)<>'object' then raise check_violation using message='Invalid excluded tag filters.'; end if;
   for group_value,term in select to_jsonb(e.key),e.value from jsonb_each(value) e loop
    if group_value #>> '{}' not in ('relationship','characters','tags','personalTags') or jsonb_typeof(term)<>'object'
     or coalesce(term->>'mode','') not in ('any','all') or jsonb_typeof(term->'tags') is distinct from 'array' then
     raise check_violation using message='Invalid excluded tag expression.';
    end if;
    if exists(select 1 from jsonb_array_elements(term->'tags') t where jsonb_typeof(t)<>'string') then
     raise check_violation using message='Invalid excluded tag value.';
    end if;
   end loop;
  elsif key='tagExpressions' then$new$);
 if updated=definition then raise exception 'Review automatic collection range and tag exclusion rules'; end if;
 execute updated;
end $$;
