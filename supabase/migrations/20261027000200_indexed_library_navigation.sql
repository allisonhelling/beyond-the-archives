begin;

-- Keep these small, indexed fields in the existing effective-document read model.
-- The shared shelf predicate remains the source of reading section semantics.
alter table public.library_search_documents
 add column reading_status text,
 add column is_favorite boolean,
 add column is_rec boolean,
 add column sort_title text collate "und-x-icu",
 add column sort_added timestamptz,
 add column sort_updated timestamptz,
 add column sort_ready integer,
 add column reading_sections text[];
create function public.index_library_document() returns trigger
language plpgsql set search_path='' as $$
begin
 new.reading_status:=new.story->>'reading_status';
 new.is_favorite:=coalesce((new.story->>'is_favorite')::boolean,false);
 new.is_rec:=coalesce((new.story->>'is_rec')::boolean,false);
 new.sort_title:=new.story->'metadata'->>'title';
 new.sort_added:=nullif(new.story->>'created_at','')::timestamptz;
 new.sort_updated:=nullif(new.story->'work'->>'ao3_updated_at','')::timestamptz;
 new.sort_ready:=case when new.story->'metadata'->>'published_chapters' is not null then
  greatest(0,(new.story->'metadata'->>'published_chapters')::integer-(new.story->>'last_read_chapter')::integer) end;
 select coalesce(array_agg(k),'{}') into new.reading_sections
 from unnest(array['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading','_active']) k
 where new.reading_status in ('reading','re_reading','waiting_for_updates','to_read','paused_reading')
  and public.library_in_shelf(new.story,case when k='_active' then '' else k end,'reading');
 return new;
end $$;
create trigger index_library_document before insert or update of story on public.library_search_documents
 for each row execute function public.index_library_document();
update public.library_search_documents set story=story;
create index library_documents_status_idx on public.library_search_documents(user_id,reading_status,id);
create index library_documents_favorite_idx on public.library_search_documents(user_id,id) where is_favorite;
create index library_documents_rec_idx on public.library_search_documents(user_id,id) where is_rec;
create index library_documents_added_idx on public.library_search_documents(user_id,sort_added desc nulls last,sort_title,id);
create index library_documents_added_reverse_idx on public.library_search_documents(user_id,sort_added asc nulls last,sort_title,id);
create index library_documents_updated_idx on public.library_search_documents(user_id,sort_updated desc nulls last,sort_title,id);
create index library_documents_updated_reverse_idx on public.library_search_documents(user_id,sort_updated asc nulls last,sort_title,id);
create index library_documents_title_idx on public.library_search_documents(user_id,sort_title,id);
create index library_documents_title_reverse_idx on public.library_search_documents(user_id,sort_title desc,id);
create index library_documents_ready_idx on public.library_search_documents(user_id,sort_ready desc nulls last,sort_title,id);
create index library_documents_ready_reverse_idx on public.library_search_documents(user_id,sort_ready asc nulls last,sort_title,id);

-- Worker writes have no reader JWT. Preserve aliases already resolved for the
-- explicit owner instead of nulling the rule when the ambient owner is absent.
alter function public.library_alias_rules(jsonb,uuid) called on null input;

-- Derived memberships are separate from editable manual memberships. Every
-- effective-document, rule or verified-alias write updates them transactionally.
create table public.automatic_collection_works (
 user_id uuid not null references auth.users(id) on delete cascade,
 collection_id uuid not null,
 library_entry_id uuid not null,
 primary key(collection_id,library_entry_id),
 foreign key(collection_id,user_id) references public.collections(id,user_id) on delete cascade,
 foreign key(user_id,library_entry_id) references public.library_search_documents(user_id,id) on delete cascade
);
alter table public.automatic_collection_works enable row level security;
alter table public.automatic_collection_works force row level security;
create policy own_automatic_memberships on public.automatic_collection_works for select to authenticated using(user_id=(select auth.uid()));
grant select on public.automatic_collection_works to authenticated;
create index automatic_memberships_entry_idx on public.automatic_collection_works(user_id,library_entry_id,collection_id);
create function public.refresh_automatic_memberships(p_owner uuid,p_entries uuid[] default null,p_collections uuid[] default null) returns void
language plpgsql security definer set search_path='' set jit=off as $$
begin
 delete from public.automatic_collection_works where user_id=p_owner
  and (p_entries is null or library_entry_id=any(p_entries))
  and (p_collections is null or collection_id=any(p_collections));
 if not exists(select 1 from public.collections where user_id=p_owner and default_key is null and automatic_rules is not null and (p_collections is null or id=any(p_collections))) then return; end if;
 with rules as materialized (
  select id,public.library_alias_rules(automatic_rules,p_owner) rules from public.collections
  where user_id=p_owner and default_key is null and automatic_rules is not null
   and (p_collections is null or id=any(p_collections))
 ) insert into public.automatic_collection_works(user_id,collection_id,library_entry_id)
 select p_owner,c.id,d.id from public.library_search_documents d cross join rules c
 where d.user_id=p_owner and (p_entries is null or d.id=any(p_entries))
  and public.automatic_collection_matches(d.story,c.rules)
 on conflict do nothing;
end $$;

-- Server caches store only ordered identities and exact counts, never display
-- documents. A reader revision invalidates them across tabs and worker writes.
create table public.library_query_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0,
 navigation jsonb,
 navigation_revision bigint
);
create table public.library_query_cache (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null,
 query jsonb not null,
 revision bigint not null,
 matches jsonb not null,
 touched_at timestamptz not null default clock_timestamp(),
 primary key(user_id,key)
);
alter table public.library_query_state enable row level security;
alter table public.library_query_state force row level security;
alter table public.library_query_cache enable row level security;
alter table public.library_query_cache force row level security;
-- Only the owner-scoped definer functions below may read/write these caches.
create function public.invalidate_library_queries(p_owner uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.library_query_state(user_id,revision) select p_owner,1 where exists(select 1 from auth.users where id=p_owner)
 on conflict(user_id) do update set revision=library_query_state.revision+1;
$$;
create function public.sync_library_query_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; old_row jsonb; new_row jsonb;
begin
 if tg_op<>'INSERT' then old_row:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then new_row:=to_jsonb(new); end if;
 if tg_op='UPDATE' then
  if old_row=new_row then return null; end if;
  if tg_table_name='ao3_tag_resolutions' and (old_row->'status',old_row->'canonical_name') is not distinct from (new_row->'status',new_row->'canonical_name') then return null; end if;
  if tg_table_name='collections' and (old_row->'automatic_rules',old_row->'default_key',old_row->'user_id') is not distinct from (new_row->'automatic_rules',new_row->'default_key',new_row->'user_id') then return null; end if;
 end if;
 owner_id:=coalesce((new_row->>'user_id')::uuid,(old_row->>'user_id')::uuid);
 if not exists(select 1 from auth.users where id=owner_id) then return null; end if;
 if tg_table_name='ao3_tag_resolutions' and current_setting('app.defer_automatic_memberships',true)='on' then
  perform set_config('app.automatic_memberships_dirty','on',true); return null;
 end if;
 perform public.invalidate_library_queries(owner_id);
 if tg_table_name='library_search_documents' and tg_op<>'DELETE' then
  perform public.refresh_automatic_memberships(owner_id,array[new.id]);
 elsif tg_table_name='collections' and tg_op<>'DELETE' then
  if tg_op='INSERT' or old.automatic_rules is distinct from new.automatic_rules then
   perform public.refresh_automatic_memberships(owner_id,null,array[new.id]);
  end if;
 elsif tg_table_name='ao3_tag_resolutions' then
  -- Failed lookups preserve verified evidence; timestamps alone do not change matches.
  if tg_op<>'UPDATE' or (old_row->'status',old_row->'canonical_name') is distinct from (new_row->'status',new_row->'canonical_name') then
   perform public.refresh_automatic_memberships(owner_id);
  end if;
 end if;
 return null;
end $$;
do $$ declare relation text; begin
 foreach relation in array array['library_search_documents','collections','library_series','collection_series','ao3_tag_resolutions'] loop
  execute format('create trigger sync_library_query_state after insert or update or delete on public.%I for each row execute function public.sync_library_query_state()',relation);
 end loop;
end $$;
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.store_tag_resolutions(uuid,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'declare r jsonb;', 'declare r jsonb; previous_defer text:=current_setting(''app.defer_automatic_memberships'',true);');
 updated:=replace(updated,' for r in select value', $new$ perform set_config('app.defer_automatic_memberships','on',true);
 perform set_config('app.automatic_memberships_dirty','off',true);
 for r in select value$new$);
 updated:=replace(updated,' end loop;', $new$ end loop;
 perform set_config('app.defer_automatic_memberships',coalesce(previous_defer,''),true);
 if current_setting('app.automatic_memberships_dirty',true)='on' and previous_defer is distinct from 'on' then
  perform public.invalidate_library_queries(p_user);
  perform public.refresh_automatic_memberships(p_user);
  perform set_config('app.automatic_memberships_dirty','off',true);
 end if;$new$);
 if updated=definition then raise exception 'Review batched tag membership invalidation'; end if;
 execute updated;
end $$;
select public.refresh_automatic_memberships(id) from auth.users;

create or replace function public.automatic_collection_ids(s jsonb,p_owner uuid) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if s->>'id' like 'series:%' then return '[]'; end if;
 return (select coalesce(jsonb_agg(collection_id order by collection_id),'[]')
  from public.automatic_collection_works where user_id=p_owner and library_entry_id=(s->>'id')::uuid);
end $$;

-- Derive status index bounds from the shared shelf matcher, including re-reads
-- on Finished. New status semantics need no second hand-maintained mapping.
create function public.library_shelf_statuses(p_shelf text) returns text[]
language sql stable set search_path='' as $$
 select array_agg(status::text) from unnest(enum_range(null::public.reading_status)) status
 where public.library_in_shelf(jsonb_build_object('reading_status',status),p_shelf,'library');
$$;

-- Automatic collections contain works only, even when the reader normally
-- shows series cards. Keep this decision shared by pools, matches and hydration.
create function public.library_query_has_series(p_query jsonb) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if p_query->>'author' is not null or p_query->>'mode' is null or p_query->>'mode'='reading' then return false; end if;
 if not coalesce(p_query->>'mode'='series' or p_query->>'shelf'='series' or (p_query->'filters'->>'showSeries')::boolean,false) then return false; end if;
 return not exists(select 1 from public.collections where user_id=(select auth.uid()) and id::text=p_query->>'shelf' and automatic_rules is not null);
end $$;

-- One owner-scoped candidate predicate serves pages and the existing facet pool.
-- Only fixed SQL fragments are interpolated; all input remains bound parameters.
create function public.library_candidate_predicate(p_query jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare predicate text:='d.user_id=$2'; shelf text:=coalesce(p_query->>'shelf','all');
begin
 if p_query->>'mode'='reading' then
  predicate:=predicate||$sql$ and d.reading_status in ('reading','re_reading','waiting_for_updates','to_read','paused_reading')$sql$;
 elsif shelf in ('currently_reading','to_read','paused_reading','finished','did_not_finish') then
  predicate:=predicate||' and d.reading_status=any(public.library_shelf_statuses($1->>''shelf''))';
 elsif shelf='favorites' then predicate:=predicate||' and d.is_favorite';
 elsif shelf='recs' then predicate:=predicate||' and d.is_rec';
 elsif shelf='series' then predicate:=predicate||' and false';
 elsif shelf<>'all' then
  predicate:=predicate||$sql$ and d.id in (
   select library_entry_id from public.collection_works where user_id=$2 and collection_id=(select id from public.collections where user_id=$2 and id::text=$1->>'shelf' and automatic_rules is null)
   union all
   select library_entry_id from public.automatic_collection_works where user_id=$2 and collection_id=(select id from public.collections where user_id=$2 and id::text=$1->>'shelf' and automatic_rules is not null))$sql$;
 end if;
 if p_query->>'author' is not null then predicate:=predicate||$sql$ and d.story->'metadata'->'authors' @> jsonb_build_array($1->>'author')$sql$; end if;
 if coalesce((p_query->'filters'->>'favorites')::boolean,false) then predicate:=predicate||' and d.is_favorite'; end if;
 if coalesce((p_query->'filters'->>'recs')::boolean,false) then predicate:=predicate||' and d.is_rec'; end if;
 return predicate;
end $$;
create function public.library_query_candidates(p_query jsonb) returns table(id uuid)
language plpgsql stable set search_path='' as $$
begin
 return query execute 'select d.id from public.library_search_documents d where '||public.library_candidate_predicate(p_query)
 using p_query,(select auth.uid());
end $$;

-- Series need their complete saved-work context before aggregation. Work-only
-- pools can narrow by status/membership first. Facets deliberately ignore result
-- filters, so pass only the scope into candidate selection.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.library_query_pool(jsonb)'::regprocedure) into definition;
 updated:=regexp_replace(definition,'series_requested:=.*?;', 'series_requested:=public.library_query_has_series(p_query);','s');
 updated:=replace(updated,' collection_rules:=public.library_alias_rules(collection_rules,(select auth.uid()));','');
 updated:=replace(updated,
 $old$with candidates as materialized (
  select d.id from public.library_search_documents d where d.user_id=(select auth.uid()) and manual_collection is null
  union all
  select cw.library_entry_id from public.collection_works cw
   where manual_collection is not null and cw.collection_id=manual_collection and cw.user_id=(select auth.uid())
 )$old$,
 $new$with candidates as materialized (
  select d.id from public.library_search_documents d where d.user_id=(select auth.uid()) and series_requested
  union all
  select id from public.library_query_candidates(jsonb_set(p_query,'{filters}','{}')) where not series_requested
 )$new$);
 updated:=replace(updated,'public.automatic_collection_matches(s,collection_rules)',
  $new$exists(select 1 from public.automatic_collection_works m where m.user_id=(select auth.uid()) and m.collection_id=(select id from public.collections where user_id=(select auth.uid()) and id::text=p_query->>'shelf') and m.library_entry_id=case when s->>'id' not like 'series:%' then (s->>'id')::uuid end)$new$);
 if updated=definition or updated not like '%library_query_candidates%' then raise exception 'Review indexed candidate pool'; end if;
 execute updated;
end $$;

-- Preserve the established mixed-series filter/order pipeline, extracted from
-- query_library so there is still only one implementation for series matching.
do $$ declare source text; pipeline text; begin
 select prosrc into source from pg_proc where oid='public.query_library(jsonb,integer,integer)'::regprocedure;
 pipeline:=substring(source from position(' with pool as materialized' in source) for position(' page_entries as (' in source)-position(' with pool as materialized' in source));
 pipeline:=replace(pipeline,'where public.library_filter(s,', 'where p_ids is not null and p_ids ? (s->>''id'') or p_ids is null and public.library_filter(s,');
 pipeline:=replace(pipeline,'totals as (select count(*) total,greatest(1,ceil(count(*)::numeric/p_size)::integer) pages from selected),','');

 -- These matches are called only for series requests, which have no reading sections.
 if pipeline is null or pipeline='' then raise exception 'Review series identity pipeline'; end if;
 execute 'create function public.library_query_series_matches(p_query jsonb,p_ids jsonb default null) returns jsonb language sql stable set search_path='''''||' set jit=off as $fn$ '||
  rtrim(pipeline,E',\n ')||$body$ select jsonb_build_object('ids',coalesce(jsonb_agg(s->>'id' order by n),'[]'),'sections','{}'::jsonb) from ordered; $fn$ $body$;
end $$;

-- The benchmark explains this same statement; it does not reconstruct a second query.
create function public.library_query_work_sql(p_query jsonb,p_reuse boolean default false,p_sections boolean default false) returns text
language plpgsql immutable set search_path='' as $$
declare ordering text; filter_clause text:=''; filters jsonb:=coalesce(p_query->'filters','{}');
begin
  -- Default filters need no JSON documents at all during identity selection.
  if coalesce(p_query->'terms','[]')<>'[]'::jsonb or exists(select 1 from jsonb_each(filters-array['sort','groupBy','scope','randomSeed','tagAliases','showSeries','favorites','recs']) e
   where e.value not in ('""'::jsonb,'[]'::jsonb,'false'::jsonb) and not (e.key='oneShot' and e.value='"allowed"')) then
   filter_clause:=$sql$ and public.library_filter(d.story,$1->'filters',$1->'terms',case $1->'filters'->>'scope' when 'summary' then d.search_summary when 'notes' then d.search_notes else d.search_any end)$sql$;
  end if;
  ordering:=case coalesce(filters->>'sort','added')
   when 'alpha' then 'sort_title,id' when 'alpha_reverse' then 'sort_title desc,id'
   when 'added' then 'sort_added desc nulls last,sort_title,id' when 'added_reverse' then 'sort_added asc nulls last,sort_title,id'
   when 'updated' then 'sort_updated desc nulls last,sort_title,id' when 'updated_reverse' then 'sort_updated asc nulls last,sort_title,id'
   when 'ready' then 'sort_ready desc nulls last,sort_title,id' when 'ready_reverse' then 'sort_ready asc nulls last,sort_title,id'
   when 'random' then 'public.library_shuffle_key(id::text,coalesce($1->''filters''->>''randomSeed'','''')),id'
   else 'sort_title,id' end;
  if p_reuse then filter_clause:=''; end if;
  return 'with filtered as not materialized (select d.id,d.sort_title,d.sort_added,d.sort_updated,d.sort_ready,d.reading_sections from public.library_search_documents d where '||
   case when p_reuse then 'd.user_id=$2 and d.id in (select value::uuid from jsonb_array_elements_text($3))' else public.library_candidate_predicate(p_query) end||filter_clause||$sql$), selected as (
    select * from filtered where $1->>'mode'<>'reading' or $1->>'mode'='reading' and reading_sections @> array[case when coalesce($1->>'shelf','view_all') in ('complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading') then coalesce($1->>'shelf','view_all') else '_active' end]
   ), ordered as (select id from selected order by $sql$||ordering||$sql$)
   select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from ordered),'[]'),
    'sections',$sql$||case when p_reuse or p_sections then '$4' else $sql$case when $1->>'mode'='reading' then (
     select jsonb_object_agg(k,n) from (
      select k,count(f.id) n from unnest(array['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading']) k
      left join filtered f on f.reading_sections @> array[k] group by k
     ) counts) else '{}'::jsonb end$sql$ end||')';
end $$;

create function public.library_query_matches(p_query jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set jit=off as $$
declare owner_id uuid:=(select auth.uid()); version bigint; signature text; matching_query jsonb; sort_key jsonb; reusable boolean; section_query jsonb; section_signature text; sections jsonb; section_cache record; cached record;
 result jsonb; filters jsonb:=coalesce(p_query->'filters','{}'); series_requested boolean;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 p_query:=p_query-'includeFacets';
 matching_query:=jsonb_set(p_query,'{filters}',filters-array['sort','groupBy','randomSeed']);
 sort_key:=jsonb_build_array(coalesce(filters->>'sort','added'),coalesce(filters->>'randomSeed',''));
 signature:=md5(matching_query::text);
 select coalesce((select revision from public.library_query_state where user_id=owner_id),0) into version;
 select * into cached from public.library_query_cache where user_id=owner_id and key=signature;
 reusable:=coalesce(cached.revision=version and cached.query=matching_query,false);
 if reusable and cached.matches->'sort'=sort_key then return cached.matches; end if;
 if reusable then sections:=cached.matches->'sections'; end if;
 if p_query->>'mode'='reading' then
  section_query:=matching_query-'shelf'; section_signature:='sections:'||md5(section_query::text);
  select * into section_cache from public.library_query_cache where user_id=owner_id and key=section_signature;
  if section_cache.revision=version and section_cache.query=section_query then sections:=section_cache.matches->'sections'; end if;
 end if;
 series_requested:=public.library_query_has_series(p_query);
 if series_requested then result:=public.library_query_series_matches(p_query,case when reusable then cached.matches->'ids' end);
 else
  execute public.library_query_work_sql(p_query,reusable,sections is not null) into result using p_query,owner_id,cached.matches->'ids',sections;
 end if;
 result:=result||jsonb_build_object('revision',version,'sort',sort_key);
 -- Serialize bounded cache writes per reader, including concurrent tabs.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':library-query-cache',0));
 insert into public.library_query_cache(user_id,key,query,revision,matches) values(owner_id,signature,matching_query,version,result)
 on conflict(user_id,key) do update set query=excluded.query,revision=excluded.revision,matches=excluded.matches,touched_at=clock_timestamp();
 if section_signature is not null then
  insert into public.library_query_cache(user_id,key,query,revision,matches) values(owner_id,section_signature,section_query,version,jsonb_build_object('sections',result->'sections'))
  on conflict(user_id,key) do update set query=excluded.query,revision=excluded.revision,matches=excluded.matches,touched_at=clock_timestamp();
 end if;
 delete from public.library_query_cache where user_id=owner_id and key in (
  select key from public.library_query_cache where user_id=owner_id order by touched_at desc,key offset 20);
 return result;
end $$;

create function public.library_revision() returns bigint
language sql volatile security definer set search_path='' as $$
 select coalesce((select revision from public.library_query_state where user_id=(select auth.uid())),0);
$$;
revoke all on function public.library_revision() from public,anon;
grant execute on function public.library_revision() to authenticated;

-- Reuse the existing response projection. Only the page's work identities load
-- their large display documents; exact counts/sections come from the match cache.
do $$ declare definition text; updated text; prefix text; begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 prefix:=substring(definition from position(' with pool as materialized' in definition) for position(' page as materialized' in definition)-position(' with pool as materialized' in definition));
 updated:=replace(definition,'LANGUAGE plpgsql STABLE','LANGUAGE plpgsql VOLATILE');
 updated:=replace(updated,'declare result jsonb;','declare result jsonb; matches jsonb; attempt integer; expected_revision bigint; total bigint; pages integer; series_requested boolean;');
 updated:=replace(updated,$alias$ p_query:=jsonb_set(p_query,'{filters}',public.library_alias_filters(coalesce(p_query->'filters','{}')-'tagAliases',(select auth.uid())));$alias$,'');
 updated:=replace(updated,prefix,$new$
 for attempt in 1..3 loop
 expected_revision:=public.library_revision();
 p_query:=jsonb_set(p_query,'{filters}',public.library_alias_filters(coalesce(p_query->'filters','{}')-'tagAliases',(select auth.uid())));
 matches:=public.library_query_matches(p_query);
 total:=jsonb_array_length(matches->'ids'); pages:=greatest(1,ceil(total::numeric/p_size)::integer);
 series_requested:=public.library_query_has_series(p_query);
 with ids as materialized (
  select matches->'ids'->>i id,i+1 n
  from generate_series((least(p_page,pages)-1)*p_size,least(least(p_page,pages)*p_size,total::integer)-1) i
 ), page_entries as (
  select d.story s,null::jsonb payload,ids.n from ids join public.library_search_documents d on d.id=ids.id::uuid
   where not series_requested and d.user_id=(select auth.uid())
  union all
  select p.s,p.payload,ids.n from public.library_query_pool(p_query) p join ids on ids.id=p.s->>'id' where series_requested
 ),$new$);
 updated:=replace(updated,$old$'sections',case when p_query->>'mode'='reading' then (select jsonb_object_agg(k,(select count(*) from filtered where public.library_in_shelf(s,k,'reading'))) from unnest(array['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading']) k) else '{}'::jsonb end$old$,
  $new$'sections',matches->'sections'$new$);
 updated:=replace(updated,'into result from totals;','into result;');
 updated:=replace(updated,'''total'',total', '''revision'',matches->''revision'',''total'',total');
 updated:=replace(updated,' return (result-', $new$ if (matches->>'revision')::bigint=expected_revision and expected_revision=coalesce(public.library_revision(),0) then
 return (result-$new$);
 updated:=replace(updated, E'end;\n', $new$ end if;
 end loop;
 raise exception 'Library changed while loading results' using errcode='40001';
end;
$new$);
 if updated=definition or updated like '%from totals%' or updated like '%count(*) from filtered%' then raise exception 'Review page identity projection'; end if;
 execute updated;
end $$;

-- Cache the existing combined navigation aggregation by the same reader revision.
do $$ declare definition text; begin
 select pg_get_functiondef('public.library_navigation()'::regprocedure) into definition;
 definition:=replace(definition,'public.library_navigation()','public.library_navigation_counts()');
 definition:=replace(definition,'select id::text,public.library_alias_rules(automatic_rules,(select auth.uid())) from public.collections','select id::text,automatic_rules from public.collections');
 definition:=replace(definition,'public.automatic_collection_matches(d.s,c.rules)',
  $new$exists(select 1 from public.automatic_collection_works a where a.user_id=(select auth.uid()) and a.collection_id=case when c.rules is not null then c.key::uuid end and a.library_entry_id=case when not d.is_series then (d.s->>'id')::uuid end)$new$);
 execute definition;
end $$;
create or replace function public.library_navigation() returns jsonb
language plpgsql volatile security definer set search_path='' set jit=off as $$
declare owner_id uuid:=(select auth.uid()); current_state record; result jsonb;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 insert into public.library_query_state(user_id) values(owner_id) on conflict do nothing;
 select * into current_state from public.library_query_state where user_id=owner_id;
 if current_state.navigation_revision=current_state.revision then return current_state.navigation; end if;
 result:=public.library_navigation_counts();
 update public.library_query_state set navigation=result,navigation_revision=current_state.revision where user_id=owner_id and revision=current_state.revision;
 return result;
end $$;

create function public.library_navigation_snapshot() returns jsonb
language plpgsql volatile set search_path='' as $$
declare version bigint; counts jsonb; attempt integer;
begin
 for attempt in 1..3 loop
  version:=public.library_revision();
  counts:=public.library_navigation();
  if version=public.library_revision() then return jsonb_build_object('revision',version,'counts',counts); end if;
 end loop;
 raise exception 'Library changed while loading counts' using errcode='40001';
end $$;
revoke all on function public.library_navigation_snapshot() from public,anon;
grant execute on function public.library_navigation_snapshot() to authenticated;

revoke all on function public.index_library_document(),public.refresh_automatic_memberships(uuid,uuid[],uuid[]),public.invalidate_library_queries(uuid),public.sync_library_query_state(),public.library_navigation_counts() from public,anon,authenticated;
revoke all on function public.library_query_has_series(jsonb),public.library_shelf_statuses(text),public.library_candidate_predicate(jsonb),public.library_query_candidates(jsonb),public.library_query_series_matches(jsonb,jsonb),public.library_query_work_sql(jsonb,boolean,boolean),public.library_query_matches(jsonb) from public,anon;
grant execute on function public.library_query_has_series(jsonb),public.library_shelf_statuses(text),public.library_candidate_predicate(jsonb),public.library_query_candidates(jsonb),public.library_query_series_matches(jsonb,jsonb),public.library_query_work_sql(jsonb,boolean,boolean),public.library_query_matches(jsonb) to authenticated;
alter function public.library_catalog() set jit=off;
notify pgrst,'reload schema';
commit;
