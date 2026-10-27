begin;

-- Automatic metadata already has separate shared/browser/manual layers. Preserve
-- that precedence while distinguishing an observed empty series from no check.
create or replace function public.nonempty_ao3_metadata(p_metadata jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) ||
  case when p_metadata->'series_checked'='true'::jsonb then jsonb_build_object('series_checked',true,
   'series',coalesce(p_metadata->'series','[]'),'series_memberships',coalesce(p_metadata->'series_memberships','[]')) else '{}'::jsonb end ||
  case when jsonb_typeof(p_metadata->'is_complete')='boolean' then jsonb_build_object('publication_status',case when (p_metadata->>'is_complete')::boolean then 'complete' else 'in_progress' end) else '{}'::jsonb end
 from jsonb_each(p_metadata)
 where value not in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
 and (jsonb_typeof(value)<>'string' or length(trim(value#>>'{}'))>0)
$$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition, 'array[''series'',''series_memberships'',', 'array[''series_checked'',''series'',''series_memberships'',');
 if updated=definition then raise exception 'Review series observation marker'; end if;
 execute updated;
end $$;

do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, '''series'',''series_memberships''', '''series_checked'',''series'',''series_memberships''');
 if updated=definition then raise exception 'Review companion series observation'; end if;
 execute updated;
end $$;

alter table public.library_entries add column reading_provenance jsonb not null default '{}' check(jsonb_typeof(reading_provenance)='object');

create index library_reading_review_owner_idx on public.library_entries(user_id,id) where reading_provenance ? 'review';

create function public.import_reading_snapshot(e public.library_entries) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('status',e.reading_status,'progress',e.last_read_chapter,'startedAt',e.started_at,'finishedAt',e.finished_at);
$$;

-- Personal edits invalidate proposals. Metadata-only changes leave them usable.
create function public.track_reading_provenance() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.reading_provenance='{}'::jsonb and new.reading_history='[]'::jsonb then new.reading_provenance:='{"source":"manual","progressKnown":true}'; end if;
 elsif (new.reading_status,new.last_read_chapter,new.started_at,new.finished_at) is distinct from
       (old.reading_status,old.last_read_chapter,old.started_at,old.finished_at) then
  new.reading_provenance:=jsonb_build_object('source','manual','progressKnown',true);
 end if;
 return new;
end $$;
create trigger zz_reading_provenance before insert or update on public.library_entries
 for each row execute function public.track_reading_provenance();

-- Repeating a listing observation may correct factual saved/bookmark dates, but
-- personal start/finish dates require the same approval as status and progress.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.apply_ao3_bookmark_observation(jsonb)'::regprocedure) into definition;
 updated:=replace(definition,
  'case when started_at is not null then least(started_at,(source->>''date'')::date::timestamp at time zone ''UTC'') end as started,',
  'case when (created or r->>''choice''=''overwrite'') and started_at is not null then least(started_at,(source->>''date'')::date::timestamp at time zone ''UTC'') else started_at end as started,');
 updated:=replace(updated, 'case when desired<>''deleted'' and not (r ? ''importReadingStatus'')',
  'case when (created or r->>''choice''=''overwrite'') and desired<>''deleted'' and not (r ? ''importReadingStatus'')');
 if updated=definition then raise exception 'Review personal bookmark date protection'; end if;
 execute updated;
end $$;

-- Creation and correction proposals share the same bookmark inference rules.
create function public.ao3_import_reading_state(r jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare v_status public.reading_status:='to_read'; progress integer:=0; known boolean:=false;
 bookmark date:=(r->>'bookmarkDate')::date; updated date:=(r->>'updatedDate')::date; metadata jsonb:=r->'metadata';
begin
 if r->>'source'='bookmarks' then
  v_status:=case when bookmark>updated then 'finished'::public.reading_status else 'reading'::public.reading_status end;
 end if;
 if r ? 'importReadingStatus' then
  v_status:=(r->>'importReadingStatus')::public.reading_status;
  if v_status is null then raise exception 'Choose a reading status' using errcode='22023'; end if;
  known:=v_status='to_read' and r->>'importReadingStatusOrigin' is distinct from 'default';
 end if;
 if v_status='finished' then known:=metadata->>'published_chapters' is not null; progress:=coalesce((metadata->>'published_chapters')::integer,0); end if;
 if r ? 'checkChapterDates' and jsonb_typeof(r->'checkChapterDates') is distinct from 'boolean' then raise exception 'Invalid chapter-date option' using errcode='22023'; end if;
 if coalesce(r->'checkChapterDates','true'::jsonb)='true'::jsonb and v_status='reading' and r->>'source'='bookmarks' and metadata ? 'chapter_dates' then
  known:=bookmark is not null and metadata->'chapter_dates' ? '1';
  progress:=public.bookmark_chapter_progress(metadata->'chapter_dates',(metadata->>'published_chapters')::integer,bookmark);
 end if;
 return jsonb_build_object('status',v_status,'progress',progress,'progressKnown',known);
end $$;
do $$ declare definition text; updated text; first integer; last integer; begin
 select pg_get_functiondef('public.submit_ao3_csv_works(jsonb)'::regprocedure) into definition;
 first:=strpos(definition,'  progress:=0; v_status:=''to_read'';');
 last:=strpos(definition,'  select coalesce(array_agg(c.collection_id)');
 if first=0 or last<=first then raise exception 'Review shared bookmark inference'; end if;
 updated:=replace(definition,'saved_overrides jsonb;', 'saved_overrides jsonb; import_reading jsonb;');
 updated:=replace(updated,substring(definition from first for last-first), $new$
  import_reading:=public.ao3_import_reading_state(r);
  v_status:=(import_reading->>'status')::public.reading_status;
  progress:=(import_reading->>'progress')::integer;
$new$);
 execute updated;
end $$;

-- Wrap the existing importer instead of introducing a second metadata/import
-- pipeline. It still owns validation, archive skipping, locks and CSV choices.
alter function public.submit_ao3_csv_import(jsonb) rename to submit_ao3_csv_repair_base;
create function public.submit_ao3_csv_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; e public.library_entries; snapshots jsonb:='{}'; prior jsonb; k text; result jsonb;
 proposal jsonb; progress integer; known boolean; status public.reading_status; source text;
 repaired integer:=0; series_repaired integer:=0; corrections integer:=0; repaired_ids uuid[]:='{}'; series_ids uuid[]:='{}'; reading_ids uuid[]:='{}'; state jsonb; review jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>20000000 then raise exception 'Submit 1–2000 listing works'; end if;
 for r in select value from jsonb_array_elements(p_rows) order by (value->>'workId')::bigint nulls last,(value->>'bookmarkId')::bigint loop
  perform 1 from public.works where ao3_work_id=(r->>'workId')::bigint for update;
  select le.* into e from public.library_entries le join public.works w on w.id=le.work_id where le.user_id=auth.uid()
   and (w.ao3_work_id=(r->>'workId')::bigint or r->>'bookmarkId' is not null and le.source_bookmark->>'id'=r->>'bookmarkId') for update of le;
  k:=coalesce(r->>'workId','bookmark:'||(r->>'bookmarkId'));
  if e.id is not null then snapshots:=jsonb_set(snapshots,array[k],jsonb_build_object('reading',public.import_reading_snapshot(e),'provenance',e.reading_provenance,'metadataHash',md5(e.extension_metadata::text),'series',e.extension_metadata->'series','memberships',e.extension_metadata->'series_memberships','seriesChecked',e.extension_metadata->'series_checked')); end if;
 end loop;
 result:=public.submit_ao3_csv_repair_base(p_rows);
 for r in select value from jsonb_array_elements(p_rows) loop
  select le.* into e from public.library_entries le join public.works w on w.id=le.work_id where le.user_id=auth.uid()
   and (w.ao3_work_id=(r->>'workId')::bigint or r->>'bookmarkId' is not null and le.source_bookmark->>'id'=r->>'bookmarkId');
  if e.id is null or r->>'workStatus'='deleted' then continue; end if;
  k:=coalesce(r->>'workId','bookmark:'||(r->>'bookmarkId')); prior:=snapshots->k;
  if prior is not null then
   if prior->>'metadataHash' is distinct from md5(e.extension_metadata::text) then repaired:=repaired+1; repaired_ids:=array_append(repaired_ids,e.id); end if;
   if (prior->'series',prior->'memberships',prior->'seriesChecked') is distinct from
    (e.extension_metadata->'series',e.extension_metadata->'series_memberships',e.extension_metadata->'series_checked') then series_repaired:=series_repaired+1; series_ids:=array_append(series_ids,e.id); end if;
  end if;
  proposal:=public.ao3_import_reading_state(case when prior is not null and r->>'importReadingStatusOrigin'='default' then r-'importReadingStatus' else r end);
  known:=(proposal->>'progressKnown')::boolean; progress:=(proposal->>'progress')::integer;
  status:=(proposal->>'status')::public.reading_status;
  source:=case when r->>'source'='bookmarks' then 'bookmark_inference' else 'import_default' end;
  if prior is null or r->>'choice'='overwrite' and r->>'source'='bookmarks' then
   update public.library_entries set reading_provenance=jsonb_build_object('source',case when r->>'importReadingStatusOrigin'='default' then 'import_default' when r ? 'importReadingStatus' or r->>'choice'='overwrite' then 'manual' else source end,
    'progressKnown',case when r->>'importReadingStatusOrigin'='default' then false else known end,'observedAt',now()) where id=e.id;
   continue;
  end if;
  -- Explicit user choices and accepted reviews are never reinterpreted as defaults.
  if coalesce((r->>'reviewExisting')::boolean,true)=false or r->>'source'<>'bookmarks' or r ? 'importReadingStatus' and r->>'importReadingStatusOrigin' is distinct from 'default'
   or r->>'bookmarkDate' is null or r->>'updatedDate' is null
   or prior->'provenance'->>'source' in ('manual','reviewed_import') then continue; end if;
  state:=public.import_reading_snapshot(e);
  proposal:=jsonb_build_object('status',status,'progress',case when known then progress else e.last_read_chapter end,
   'startedAt',e.started_at,'finishedAt',case when status='finished' then (r->>'bookmarkDate')::date::timestamp at time zone 'UTC' else null end);
  if proposal=state and (not known or prior->'provenance'->'progressKnown'='true'::jsonb) then
   update public.library_entries set reading_provenance=reading_provenance-'review' where id=e.id and reading_provenance ? 'review';
   continue;
  end if;
  review:=jsonb_build_object('saved',state,'proposed',proposal,'progressKnown',known,
   'source',coalesce(prior->'provenance'->>'source','legacy_unknown'),'savedProgressKnown',coalesce(prior->'provenance'->'progressKnown','false'::jsonb),'observedAt',now());
  -- Retrying a dismissed observation does not repeatedly ask the same question.
  if e.reading_provenance->'dismissed' = (review-'observedAt') then continue; end if;
  update public.library_entries set reading_provenance=reading_provenance||jsonb_build_object('review',review) where id=e.id;
  corrections:=corrections+1; reading_ids:=array_append(reading_ids,e.id);
 end loop;
 return result||jsonb_build_object('metadataRepaired',repaired,'seriesRepaired',series_repaired,'readingCorrections',corrections,'repairWorkIds',jsonb_build_object('metadata',repaired_ids,'series',series_ids,'reading',reading_ids));
end $$;

-- The existing sync function resolves the replaced CSV entrypoint on execution.
do $$ begin execute pg_get_functiondef('public.submit_ao3_library_sync(jsonb,uuid,text)'::regprocedure); end $$;

create function public.review_import_reading(p_ids uuid[] default '{}',p_action text default 'list',p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare e public.library_entries; review jsonb; changed integer:=0; skipped integer:=0; results jsonb; total integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action not in ('list','accept','keep') or p_page is null or p_page<1 or coalesce(cardinality(p_ids),0)>2000 then raise exception 'Invalid reading review'; end if;
 if p_action<>'list' then
  for e in select * from public.library_entries where user_id=auth.uid() and id=any(p_ids) order by id for update loop
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
 select count(*) into total from public.library_entries where user_id=auth.uid() and reading_provenance ? 'review';
 select coalesce(jsonb_agg(value),'[]') into results from (
  select jsonb_build_object('id',e.id,'title',d.story->'metadata'->>'title','saved',e.reading_provenance->'review'->'saved',
   'proposed',e.reading_provenance->'review'->'proposed','source',e.reading_provenance->'review'->'source',
   'progressKnown',e.reading_provenance->'review'->'progressKnown','savedProgressKnown',e.reading_provenance->'review'->'savedProgressKnown') value
  from public.library_entries e join public.library_search_documents d on d.id=e.id
  where e.user_id=auth.uid() and e.reading_provenance ? 'review' order by e.id limit 50 offset (p_page-1)::bigint*50
 ) page;
 return jsonb_build_object('reviews',results,'total',total,'changed',changed,'skipped',skipped);
end $$;

-- Older backups restore provenance as unknown; do not invent import history.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.restore_library_backup_internal(jsonb,uuid,boolean,boolean)'::regprocedure) into definition;
 updated:=replace(definition,'if t=''library_entries'' then', $new$if t='library_entries' then
   select coalesce(jsonb_agg(r||jsonb_build_object('reading_provenance',coalesce(nullif(r->'reading_provenance','null'::jsonb),'{}'::jsonb))),'[]') into rows from jsonb_array_elements(rows) r;$new$);
 if updated=definition then raise exception 'Review reading provenance backup compatibility'; end if;
 execute updated;
end $$;

revoke all on function public.submit_ao3_csv_repair_base(jsonb),public.track_reading_provenance(),public.ao3_import_reading_state(jsonb),public.import_reading_snapshot(public.library_entries) from public,anon,authenticated;
revoke all on function public.submit_ao3_csv_import(jsonb),public.review_import_reading(uuid[],text,integer) from public,anon;
grant execute on function public.submit_ao3_csv_import(jsonb),public.review_import_reading(uuid[],text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
