begin;

-- Extend the shared predicate so page queries and automatic collections agree.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, $old$ and (coalesce(f->>'updatedAfter','')=''$old$, $new$
 and not exists (
  select 1 from unnest(string_to_array(public.library_normalize(coalesce(f->>'personalTags','')),',')) term
  where trim(term)<>'' and not exists (
   select 1 from jsonb_array_elements_text(coalesce(s->'personalTags','[]')) tag
   where strpos(public.library_normalize(tag),trim(term))>0))
 and (coalesce(f->>'updatedAfter','')=''$new$);
 if updated=definition then raise exception 'Review personal tag filter predicate'; end if;
 execute updated;

 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, '''characters'',''tags''', '''characters'',''tags'',''personalTags''');
 if updated=definition then raise exception 'Review personal tag collection validation'; end if;
 execute updated;

 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 updated:=replace(definition,
  $old$else s->>'reading_status' in ('reading','re_reading','waiting_for_updates') end$old$,
  $new$else s->>'reading_status' in ('reading','re_reading') end$new$);
 if updated=definition then raise exception 'Review non-caught up reading shelf'; end if;
 execute updated;

 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated:=replace(definition, $old$'suggestions',jsonb_build_object('relationships',$old$,
  $new$'suggestions',jsonb_build_object('personalTags',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'personalTags','[]'))) t),'relationships',$new$);
 if updated=definition then raise exception 'Review personal tag suggestions'; end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
commit;
