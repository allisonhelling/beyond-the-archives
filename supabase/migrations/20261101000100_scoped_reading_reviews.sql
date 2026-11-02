begin;

-- Apply the same import scope before counting, paging, and changing corrections.
-- Null keeps the existing API contract; an empty scope intentionally returns none.
drop function public.review_import_reading(uuid[],text,integer);
create function public.review_import_reading(p_ids uuid[] default '{}',p_action text default 'list',p_page integer default 1,p_scope uuid[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare e public.library_entries; review jsonb; changed integer:=0; skipped integer:=0; results jsonb; total integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action not in ('list','accept','keep') or p_page is null or p_page<1 or coalesce(cardinality(p_ids),0)>2000 then raise exception 'Invalid reading review'; end if;
 if p_action<>'list' then
  for e in select * from public.library_entries where user_id=auth.uid() and id=any(p_ids) and (p_scope is null or id=any(p_scope)) order by id for update loop
   review:=e.reading_provenance->'review';
   if review is null then skipped:=skipped+1; continue; end if;
   if public.import_reading_snapshot(e) is distinct from review->'saved' then
    update public.library_entries set reading_provenance=reading_provenance-'review' where id=e.id;
    skipped:=skipped+1; continue;
   end if;
   if p_action='keep' then
    update public.library_entries set reading_provenance=(reading_provenance-'review')||jsonb_build_object('dismissed',review-'observedAt') where id=e.id;
   else
    -- Existing transition/date triggers record history. Only personal reading
    -- fields change; notes, tags, ratings, favorites and metadata are untouched.
    update public.library_entries set reading_status=(review->'proposed'->>'status')::public.reading_status,
     last_read_chapter=(review->'proposed'->>'progress')::integer where id=e.id;
    update public.library_entries set started_at=(review->'proposed'->>'startedAt')::timestamptz,finished_at=(review->'proposed'->>'finishedAt')::timestamptz where id=e.id;
    update public.library_entries set reading_provenance=jsonb_build_object('source','reviewed_import','progressKnown',review->'progressKnown','observedAt',now()) where id=e.id;
   end if;
   changed:=changed+1;
  end loop;
 end if;
 select count(*) into total from public.library_entries where user_id=auth.uid() and reading_provenance ? 'review' and (p_scope is null or id=any(p_scope));
 select coalesce(jsonb_agg(value),'[]') into results from (
  select jsonb_build_object('id',e.id,'title',d.story->'metadata'->>'title','saved',e.reading_provenance->'review'->'saved',
   'proposed',e.reading_provenance->'review'->'proposed','source',e.reading_provenance->'review'->'source',
   'progressKnown',e.reading_provenance->'review'->'progressKnown','savedProgressKnown',e.reading_provenance->'review'->'savedProgressKnown') value
  from public.library_entries e join public.library_search_documents d on d.id=e.id
  where e.user_id=auth.uid() and e.reading_provenance ? 'review' and (p_scope is null or e.id=any(p_scope)) order by e.id limit 50 offset (p_page-1)::bigint*50
 ) page;
 return jsonb_build_object('reviews',results,'total',total,'changed',changed,'skipped',skipped);
end $$;
revoke all on function public.review_import_reading(uuid[],text,integer,uuid[]) from public,anon;
grant execute on function public.review_import_reading(uuid[],text,integer,uuid[]) to authenticated;

commit;
