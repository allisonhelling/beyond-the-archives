begin;

-- Personal series data is independent of an optional downloaded AO3 snapshot.
create function public.ensure_library_series(p_series bigint,p_title text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_series is null or p_series not between 1 and 9007199254740991 or p_title is null or length(trim(p_title))=0 or length(p_title)>10000 then
  raise exception 'Invalid series identity' using errcode='22023';
 end if;
 insert into public.library_series(user_id,ao3_series_id,metadata)
 values(auth.uid(),p_series,jsonb_build_object('seriesId',p_series,'title',p_title,'normalizedUrl','https://archiveofourown.org/series/'||p_series,'description','','works','[]'::jsonb,'basic',true))
 on conflict(user_id,ao3_series_id) do nothing;
end;
$$;
create function public.remove_library_series_details(p_series bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.library_series set metadata=jsonb_build_object('seriesId',ao3_series_id,'title',metadata->>'title','normalizedUrl','https://archiveofourown.org/series/'||ao3_series_id,'description','','works','[]'::jsonb,'basic',true)
 where user_id=auth.uid() and ao3_series_id=p_series;
end;
$$;
revoke all on function public.ensure_library_series(bigint,text), public.remove_library_series_details(bigint) from public,anon;
grant execute on function public.ensure_library_series(bigint,text), public.remove_library_series_details(bigint) to authenticated;

-- Extend the existing query projection; keep its grouping and search semantics.
do $$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.library_series_results(jsonb)'::regprocedure) into definition;
 updated := replace(definition,
  $old$or is_favorite or reading_status='finished'$old$,
  $new$or metadata->'basic'='false'::jsonb or is_favorite or reading_status='finished'$new$);
 updated := replace(updated,
  $old$'detailsLoaded',preview is not null$old$,
  $new$'detailsLoaded',preview is not null and coalesce(preview->'basic','false')<>'true'::jsonb$new$);
 updated := replace(updated,
  $old$'word_count',preview->'wordCount') m,$old$,
  $new$'word_count',case when preview is null or preview->'basic'='true'::jsonb then
   (select case when count(*)>0 and count(w->>'wordCount')=count(*) then sum((w->>'wordCount')::bigint) else null end from jsonb_array_elements(works) w)::text::jsonb
   else preview->'wordCount' end) m,$new$);
 updated := replace(updated,
  $old$'description',coalesce(preview->>'description',''),'creators'$old$,
  $new$'wordCount',m->'word_count','description',coalesce(preview->>'description',''),'creators'$new$);
 if updated=definition or updated not like '%metadata->''basic''=''false''%' or updated not like '%''wordCount'',m->''word_count''%' then
  raise exception 'Review optional series query projection';
 end if;
 execute updated;
end;
$$;
commit;
