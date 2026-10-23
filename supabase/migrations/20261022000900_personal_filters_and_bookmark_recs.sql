begin;

-- One private bookmark observation holds the three-state Rec setting. A lock
-- or admin-hidden icon does not reveal whether the Rec checkbox was selected.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, ' wid:=(r->>''workId'')::bigint;', $hook$ if r ? 'bookmarkRec' and jsonb_typeof(r->'bookmarkRec') not in ('boolean','null') then raise exception 'Invalid bookmark Rec'; end if;
 wid:=(r->>'workId')::bigint;$hook$);
 updated:=replace(updated, ' update public.library_entries set source_bookmark=source_bookmark||source,', $hook$
 if bid is not null then
  source:=source||jsonb_build_object('rec',case
   when r ? 'bookmarkRec' then r->'bookmarkRec'
   when coalesce(r->>'bookmarkStatus','') ~ '(^|\s)rec(\s|$)' then 'true'::jsonb
   when coalesce(r->>'bookmarkStatus','') ~ '(^|\s)public(\s|$)' and coalesce(r->>'bookmarkStatus','') !~ '(^|\s)(private|hidden)(\s|$)' then 'false'::jsonb
   else 'null'::jsonb end);
 end if;
 update public.library_entries set source_bookmark=source_bookmark||source,$hook$);
 if updated=definition or updated not like '%Invalid bookmark Rec%' then raise exception 'Review bookmark Rec observations'; end if;
 execute updated;

 select pg_get_functiondef('public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, ' and (not coalesce((f->>''favorites'')::boolean,false) or (s->>''is_favorite'')::boolean)', $hook$ and (not coalesce((f->>'favorites')::boolean,false) or (s->>'is_favorite')::boolean)
 and (not coalesce((f->>'personalNotes')::boolean,false) or coalesce(s->>'notes','') ~ '[^[:space:]]')
 and (not coalesce((f->>'recs')::boolean,false) or coalesce(s->'source_bookmark'->'rec'='true'::jsonb,false))
 and (coalesce(f->'personalRating','[]')='[]'::jsonb or exists(
  select 1 from jsonb_array_elements(coalesce(nullif(s->'personalRatings','[]'::jsonb),jsonb_build_array(s->'personal_rating'))) rating
  where f->'personalRating' ? coalesce(rating #>> '{}','unrated')))$hook$);
 if updated=definition then raise exception 'Review personal library filters'; end if;
 execute updated;

 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 updated:=replace(definition, ' when ''favorites'' then', ' when ''recs'' then coalesce(s->''source_bookmark''->''rec''=''true''::jsonb,false) when ''favorites'' then');
 if updated=definition then raise exception 'Review Recs shelf'; end if;
 execute updated;

 select pg_get_functiondef('public.check_automatic_collection_rules(jsonb,text)'::regprocedure) into definition;
 updated:=replace(definition, '(''fandoms'',''publication'',''rating'')', '(''fandoms'',''publication'',''rating'',''personalRating'')');
 updated:=replace(updated, '(''inSeries'',''favorites'')', '(''inSeries'',''favorites'',''personalNotes'',''recs'')');
 if updated=definition then raise exception 'Review automatic collection personal filters'; end if;
 execute updated;

 -- Series use the ratings of their saved works, just as content-rating filters
 -- already match any work in the series. Unsaved works have no personal rating.
 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '''reading_status'',status,''is_favorite''', '''personalRatings'',jsonb_path_query_array(saved,''$[*].personal_rating''),''reading_status'',status,''is_favorite''');
 if updated=definition then raise exception 'Review series personal ratings'; end if;
 execute updated;

 -- Shelf counts need Rec status even before full work details are loaded.
 select pg_get_functiondef('public.library_catalog()'::regprocedure) into definition;
 updated:=replace(definition, '''reading_status'',story->''reading_status''', '''source_bookmark'',jsonb_build_object(''rec'',story->''source_bookmark''->''rec''),''reading_status'',story->''reading_status''');
 if updated=definition then raise exception 'Review compact Rec catalog'; end if;
 execute updated;
end $$;

update public.library_entries set source_bookmark=source_bookmark||jsonb_build_object('rec',case
 when coalesce(source_bookmark->>'status','') ~ '(^|\s)rec(\s|$)' then true
 when coalesce(source_bookmark->>'status','') ~ '(^|\s)public(\s|$)' and coalesce(source_bookmark->>'status','') !~ '(^|\s)(private|hidden)(\s|$)' then false
 else null end)
 where source_bookmark<>'{}' and not source_bookmark ? 'rec';
select public.refresh_library_documents(array(select id from public.library_entries));
notify pgrst,'reload schema';
commit;
