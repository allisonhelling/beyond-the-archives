begin;
alter table public.library_series add column is_favorite boolean not null default false;
alter table public.library_series add column reading_status public.reading_status not null default 'to_read';
alter table public.library_series add constraint library_series_id_owner unique(id,user_id);
create table public.collection_series (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 collection_id uuid not null,
 library_series_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(collection_id,library_series_id),
 foreign key(collection_id,user_id) references public.collections(id,user_id) on delete cascade,
 foreign key(library_series_id,user_id) references public.library_series(id,user_id) on delete cascade
);
alter table public.collection_series enable row level security;
alter table public.collection_series force row level security;
create policy own_collection_series on public.collection_series for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on public.collection_series to authenticated;

create function public.update_library_series(p_series bigint,p_input jsonb,p_base jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare saved public.library_series; baseline jsonb; result jsonb; chosen uuid[];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_base is null or jsonb_typeof(p_base)<>'object'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('favorite','collections')) then raise exception 'Invalid series changes' using errcode='22023'; end if;
 select * into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series for update;
 if not found then raise exception 'Load the series details first' using errcode='22023'; end if;
 baseline:=jsonb_build_object('favorite',saved.is_favorite,'collections',coalesce((select jsonb_agg(collection_id order by collection_id) from public.collection_series where library_series_id=saved.id and user_id=auth.uid()),'[]'::jsonb));
 result:=public.merge_library_edits(p_base,p_input,baseline);
 if result->'conflicts'<>'[]'::jsonb then raise exception 'This series changed on another device. Review both versions before saving.' using errcode='40001',detail=(result||jsonb_build_object('base',baseline))::text; end if;
 if jsonb_typeof(result->'merged'->'favorite') is distinct from 'boolean' or jsonb_typeof(result->'merged'->'collections') is distinct from 'array' then raise exception 'Invalid series changes' using errcode='22023'; end if;
 select coalesce(array_agg(value::uuid),array[]::uuid[]) into chosen from jsonb_array_elements_text(result->'merged'->'collections');
 if exists(select 1 from unnest(chosen) c where not exists(select 1 from public.collections where id=c and user_id=auth.uid() and default_key is null)) then raise exception 'Collection unavailable' using errcode='42501'; end if;
 update public.library_series set is_favorite=(result->'merged'->>'favorite')::boolean where id=saved.id;
 update public.collections set last_story_added_at=now() where user_id=auth.uid() and id=any(chosen) and not exists(select 1 from public.collection_series where library_series_id=saved.id and collection_id=collections.id);
 delete from public.collection_series where library_series_id=saved.id and user_id=auth.uid() and not(collection_id=any(chosen));
 insert into public.collection_series(user_id,collection_id,library_series_id) select auth.uid(),c,saved.id from (select distinct unnest(chosen) c) selected on conflict do nothing;
end;
$$;
revoke all on function public.update_library_series(bigint,jsonb,jsonb) from public,anon;
grant execute on function public.update_library_series(bigint,jsonb,jsonb) to authenticated;

-- Explicit bulk reading action. Only reading fields change on existing entries;
-- missing works are saved privately from the available series snapshot.
create function public.finish_library_series(p_series bigint) returns integer
language plpgsql security definer set search_path='' as $$
declare saved public.library_series; item jsonb; work_key bigint; work_uuid uuid; meta jsonb; affected integer:=0; chapters integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series for update;
 if not found then raise exception 'Load the series details first' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(saved.metadata->'works') loop
  work_key:=(item->>'workId')::bigint;
  chapters:=case when item->>'chapters' ~ '^[0-9]+/([0-9]+|\?)$' and length(split_part(item->>'chapters','/',1))<10 then split_part(item->>'chapters','/',1)::integer else null end;
  meta:=jsonb_build_object('title',coalesce(nullif(item->>'title',''),'AO3 work '||work_key),'authors',coalesce(item->'authors','[]'::jsonb),'fandoms',coalesce(item->'fandoms','[]'::jsonb),'summary',coalesce(item->>'summary',''),'rating',coalesce(item->>'rating',''),'relationship_tags',coalesce(item->'relationshipTags','[]'::jsonb),'character_tags',coalesce(item->'characterTags','[]'::jsonb),'additional_tags',coalesce(item->'additionalTags',item->'tags','[]'::jsonb),'ao3_tags',coalesce(item->'tags','[]'::jsonb),'published_chapters',chapters,'total_chapters',case when split_part(item->>'chapters','/',2) ~ '^[0-9]{1,9}$' then split_part(item->>'chapters','/',2)::integer else null end,'publication_status',case when item->'complete'='true'::jsonb then 'complete' when item->'complete'='false'::jsonb then 'in_progress' else 'unknown' end,'word_count',item->'wordCount','series',jsonb_build_array(saved.metadata->>'title'),'series_memberships',jsonb_build_array(jsonb_build_object('id',p_series,'name',saved.metadata->>'title','url',saved.metadata->>'normalizedUrl','position',item->'position')));
  insert into public.works(ao3_work_id) values(work_key) on conflict(ao3_work_id) do nothing;
  select id into work_uuid from public.works where ao3_work_id=work_key;
  insert into public.library_entries(user_id,work_id,original_url,reading_status,last_read_chapter,extension_metadata)
   values(auth.uid(),work_uuid,item->>'url','finished',coalesce(chapters,0),meta) on conflict(user_id,work_id) do nothing;
 end loop;
 -- Include owned memberships even if a restricted work disappeared from AO3's listing.
 update public.library_entries e set reading_status='finished',last_read_chapter=greatest(e.last_read_chapter,coalesce(
  case when coalesce(e.metadata_overrides->>'published_chapters',e.extension_metadata->>'published_chapters') ~ '^[0-9]{1,9}$' then coalesce(e.metadata_overrides->>'published_chapters',e.extension_metadata->>'published_chapters')::integer end,w.published_chapters,
  (select case when value->>'chapters' ~ '^[0-9]{1,9}/' then split_part(value->>'chapters','/',1)::integer end from jsonb_array_elements(saved.metadata->'works') where (value->>'workId')::bigint=w.ao3_work_id limit 1),e.last_read_chapter))
 from public.works w where e.work_id=w.id and e.user_id=auth.uid() and (
  exists(select 1 from jsonb_array_elements(saved.metadata->'works') where (value->>'workId')::bigint=w.ao3_work_id)
  or coalesce(e.metadata_overrides->'series_memberships',e.extension_metadata->'series_memberships',w.automatic_metadata->'series_memberships','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',p_series)));
 get diagnostics affected=row_count;
 update public.library_series set reading_status='finished' where id=saved.id;
 return affected;
end;
$$;
revoke all on function public.finish_library_series(bigint) from public,anon;
grant execute on function public.finish_library_series(bigint) to authenticated;
commit;
