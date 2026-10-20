begin;

-- One private projection is shared by page queries, targeted refreshes, and details.
-- Invoker rights retain the policies on every underlying relation.
create view public.library_story_documents with (security_invoker=true) as
select e.id, e.user_id, e.work_id,
 to_jsonb(e) || jsonb_build_object('work', w.data, 'metadata',
 jsonb_build_object('title',coalesce(w.data->>'title','AO3 work '||base.ao3_work_id),
 'summary',coalesce(w.data->>'summary',''),'rating',coalesce(w.data->>'rating',''),
 'word_count',w.data->'word_count','published_chapters',w.data->'published_chapters','total_chapters',w.data->'total_chapters',
 'publication_status',case w.data->>'is_complete' when 'true' then 'complete' when 'false' then 'in_progress' else 'unknown' end,
 'authors',coalesce(a.names,'[]'),'author_links',coalesce(a.links,'{}'),'fandoms',coalesce(f.names,'[]'),
 'ao3_tags',coalesce(t.names,'[]'),'archive_warnings',coalesce(t.warnings,'[]'),'categories',coalesce(t.categories,'[]'),
 'relationship_tags',coalesce(t.relationships,'[]'),'character_tags',coalesce(t.characters,'[]'),'additional_tags',coalesce(t.freeforms,'[]'))
 || (w.data->'automatic_metadata') || e.metadata_overrides,
 'collectionIds',coalesce(c.ids,'[]'),'personalTags',coalesce(p.names,'[]')) as story
from public.library_entries e join public.works base on base.id=e.work_id
cross join lateral (select to_jsonb(base) || coalesce((select jsonb_object_agg(key,value) from jsonb_each(e.extension_metadata)
 where key=any(array['title','summary','rating','word_count','published_chapters','total_chapters','is_complete','ao3_published_at','ao3_updated_at','last_metadata_check','last_metadata_success'])),'{}')
 || jsonb_build_object('automatic_metadata',base.automatic_metadata||e.extension_metadata,
 'verified_chapters',case when e.extension_chapters<>'{}'::jsonb then e.extension_chapters else base.verified_chapters end) as data) w
left join lateral (select jsonb_agg(a.name order by a.id) names,
 jsonb_object_agg(a.name,a.ao3_url) filter(where a.ao3_url is not null) links
 from public.work_authors l join public.authors a on a.id=l.author_id where l.work_id=e.work_id) a on true
left join lateral (select jsonb_agg(f.name order by f.id) names from public.work_fandoms l join public.fandoms f on f.id=l.fandom_id where l.work_id=e.work_id) f on true
left join lateral (select jsonb_agg(t.name order by l.source_position nulls last,t.id) names,
 jsonb_agg(t.name order by l.source_position nulls last,t.id) filter(where t.category='warning') warnings,
 jsonb_agg(t.name order by l.source_position nulls last,t.id) filter(where t.category='category') categories,
 jsonb_agg(t.name order by l.source_position nulls last,t.id) filter(where t.category='relationship') relationships,
 jsonb_agg(t.name order by l.source_position nulls last,t.id) filter(where t.category='character') characters,
 jsonb_agg(t.name order by l.source_position nulls last,t.id) filter(where t.category='freeform') freeforms
 from public.work_tags l join public.tags t on t.id=l.tag_id where l.work_id=e.work_id) t on true
left join lateral (select jsonb_agg(collection_id order by collection_id) ids from public.collection_works where library_entry_id=e.id) c on true
left join lateral (select jsonb_agg(coalesce(t.name,'') order by l.personal_tag_id) names from public.library_entry_tags l left join public.personal_tags t on t.id=l.personal_tag_id where l.library_entry_id=e.id) p on true;
grant select on public.library_story_documents to authenticated;

-- The measured live join projection repeats RLS and relation aggregation for
-- every search/count. Maintain this private read model at the source instead.
create table public.library_search_documents (
 id uuid primary key references public.library_entries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 work_id uuid not null references public.works(id) on delete cascade,
 story jsonb not null,
 unique(user_id,id)
);
alter table public.library_search_documents enable row level security;
alter table public.library_search_documents force row level security;
create policy own_search_documents on public.library_search_documents for select to authenticated using(user_id=(select auth.uid()));
grant select on public.library_search_documents to authenticated;
create index library_search_work_idx on public.library_search_documents(work_id);

create function public.refresh_library_documents(p_ids uuid[]) returns void
language sql security definer set search_path='' as $$
 insert into public.library_search_documents(id,user_id,work_id,story)
 select id,user_id,work_id,story from public.library_story_documents where id=any(p_ids)
 on conflict(id) do update set user_id=excluded.user_id,work_id=excluded.work_id,story=excluded.story;
$$;
revoke all on function public.refresh_library_documents(uuid[]) from public,anon,authenticated;
create function public.sync_library_documents() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb; ids uuid[]; work_ids uuid[]; entity_ids uuid[];
begin
 if tg_op<>'INSERT' then old_row:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then new_row:=to_jsonb(new); end if;
 if tg_table_name='library_entries' then
  if tg_op='DELETE' then return null; end if;
  ids:=array[(new_row->>'id')::uuid];
 elsif tg_table_name in ('collection_works','library_entry_tags') then
  ids:=array[(old_row->>'library_entry_id')::uuid,(new_row->>'library_entry_id')::uuid];
 elsif tg_table_name in ('works','work_authors','work_fandoms','work_tags') then
  work_ids:=array[(old_row->>case when tg_table_name='works' then 'id' else 'work_id' end)::uuid,(new_row->>case when tg_table_name='works' then 'id' else 'work_id' end)::uuid];
 else
  entity_ids:=array[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
  case tg_table_name
   when 'authors' then select array_agg(work_id) into work_ids from public.work_authors where author_id=any(entity_ids);
   when 'fandoms' then select array_agg(work_id) into work_ids from public.work_fandoms where fandom_id=any(entity_ids);
   when 'tags' then select array_agg(work_id) into work_ids from public.work_tags where tag_id=any(entity_ids);
   when 'personal_tags' then select array_agg(library_entry_id) into ids from public.library_entry_tags where personal_tag_id=any(entity_ids);
  end case;
 end if;
 if work_ids is not null then select array_agg(id) into ids from public.library_entries where work_id=any(work_ids); end if;
 if cardinality(ids)>0 then perform public.refresh_library_documents(ids); end if;
 return null;
end;
$$;
revoke all on function public.sync_library_documents() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['library_entries','collection_works','library_entry_tags','works','work_authors','work_fandoms','work_tags','authors','fandoms','tags','personal_tags'] loop
  execute format('create trigger sync_library_search after insert or update or delete on public.%I for each row execute function public.sync_library_documents()',t);
 end loop;
end;
$$;
insert into public.library_search_documents select id,user_id,work_id,story from public.library_story_documents;

-- Unicode normalization matches the browser search contract without depending on
-- an optional unaccent extension. The Mark ranges below are generated by
-- scripts/generate-search-unicode.mjs from the browser search expression. NFKD also handles compatibility characters.
create function public.library_normalize(p_text text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(normalize(coalesce(p_text,''),NFKD),U&'[\0300-\036f\0483-\0489\0591-\05bd\05bf\05c1-\05c2\05c4-\05c5\05c7\0610-\061a\064b-\065f\0670\06d6-\06dc\06df-\06e4\06e7-\06e8\06ea-\06ed\0711\0730-\074a\07a6-\07b0\07eb-\07f3\07fd\0816-\0819\081b-\0823\0825-\0827\0829-\082d\0859-\085b\0897-\089f\08ca-\08e1\08e3-\0903\093a-\093c\093e-\094f\0951-\0957\0962-\0963\0981-\0983\09bc\09be-\09c4\09c7-\09c8\09cb-\09cd\09d7\09e2-\09e3\09fe\0a01-\0a03\0a3c\0a3e-\0a42\0a47-\0a48\0a4b-\0a4d\0a51\0a70-\0a71\0a75\0a81-\0a83\0abc\0abe-\0ac5\0ac7-\0ac9\0acb-\0acd\0ae2-\0ae3\0afa-\0aff\0b01-\0b03\0b3c\0b3e-\0b44\0b47-\0b48\0b4b-\0b4d\0b55-\0b57\0b62-\0b63\0b82\0bbe-\0bc2\0bc6-\0bc8\0bca-\0bcd\0bd7\0c00-\0c04\0c3c\0c3e-\0c44\0c46-\0c48\0c4a-\0c4d\0c55-\0c56\0c62-\0c63\0c81-\0c83\0cbc\0cbe-\0cc4\0cc6-\0cc8\0cca-\0ccd\0cd5-\0cd6\0ce2-\0ce3\0cf3\0d00-\0d03\0d3b-\0d3c\0d3e-\0d44\0d46-\0d48\0d4a-\0d4d\0d57\0d62-\0d63\0d81-\0d83\0dca\0dcf-\0dd4\0dd6\0dd8-\0ddf\0df2-\0df3\0e31\0e34-\0e3a\0e47-\0e4e\0eb1\0eb4-\0ebc\0ec8-\0ece\0f18-\0f19\0f35\0f37\0f39\0f3e-\0f3f\0f71-\0f84\0f86-\0f87\0f8d-\0f97\0f99-\0fbc\0fc6\102b-\103e\1056-\1059\105e-\1060\1062-\1064\1067-\106d\1071-\1074\1082-\108d\108f\109a-\109d\135d-\135f\1712-\1715\1732-\1734\1752-\1753\1772-\1773\17b4-\17d3\17dd\180b-\180d\180f\1885-\1886\18a9\1920-\192b\1930-\193b\1a17-\1a1b\1a55-\1a5e\1a60-\1a7c\1a7f\1ab0-\1add\1ae0-\1aeb\1b00-\1b04\1b34-\1b44\1b6b-\1b73\1b80-\1b82\1ba1-\1bad\1be6-\1bf3\1c24-\1c37\1cd0-\1cd2\1cd4-\1ce8\1ced\1cf4\1cf7-\1cf9\1dc0-\1dff\20d0-\20f0\2cef-\2cf1\2d7f\2de0-\2dff\302a-\302f\3099-\309a\a66f-\a672\a674-\a67d\a69e-\a69f\a6f0-\a6f1\a802\a806\a80b\a823-\a827\a82c\a880-\a881\a8b4-\a8c5\a8e0-\a8f1\a8ff\a926-\a92d\a947-\a953\a980-\a983\a9b3-\a9c0\a9e5\aa29-\aa36\aa43\aa4c-\aa4d\aa7b-\aa7d\aab0\aab2-\aab4\aab7-\aab8\aabe-\aabf\aac1\aaeb-\aaef\aaf5-\aaf6\abe3-\abea\abec-\abed\fb1e\fe00-\fe0f\fe20-\fe2f\+0101fd\+0102e0\+010376-\+01037a\+010a01-\+010a03\+010a05-\+010a06\+010a0c-\+010a0f\+010a38-\+010a3a\+010a3f\+010ae5-\+010ae6\+010d24-\+010d27\+010d69-\+010d6d\+010eab-\+010eac\+010efa-\+010eff\+010f46-\+010f50\+010f82-\+010f85\+011000-\+011002\+011038-\+011046\+011070\+011073-\+011074\+01107f-\+011082\+0110b0-\+0110ba\+0110c2\+011100-\+011102\+011127-\+011134\+011145-\+011146\+011173\+011180-\+011182\+0111b3-\+0111c0\+0111c9-\+0111cc\+0111ce-\+0111cf\+01122c-\+011237\+01123e\+011241\+0112df-\+0112ea\+011300-\+011303\+01133b-\+01133c\+01133e-\+011344\+011347-\+011348\+01134b-\+01134d\+011357\+011362-\+011363\+011366-\+01136c\+011370-\+011374\+0113b8-\+0113c0\+0113c2\+0113c5\+0113c7-\+0113ca\+0113cc-\+0113d0\+0113d2\+0113e1-\+0113e2\+011435-\+011446\+01145e\+0114b0-\+0114c3\+0115af-\+0115b5\+0115b8-\+0115c0\+0115dc-\+0115dd\+011630-\+011640\+0116ab-\+0116b7\+01171d-\+01172b\+01182c-\+01183a\+011930-\+011935\+011937-\+011938\+01193b-\+01193e\+011940\+011942-\+011943\+0119d1-\+0119d7\+0119da-\+0119e0\+0119e4\+011a01-\+011a0a\+011a33-\+011a39\+011a3b-\+011a3e\+011a47\+011a51-\+011a5b\+011a8a-\+011a99\+011b60-\+011b67\+011c2f-\+011c36\+011c38-\+011c3f\+011c92-\+011ca7\+011ca9-\+011cb6\+011d31-\+011d36\+011d3a\+011d3c-\+011d3d\+011d3f-\+011d45\+011d47\+011d8a-\+011d8e\+011d90-\+011d91\+011d93-\+011d97\+011ef3-\+011ef6\+011f00-\+011f01\+011f03\+011f34-\+011f3a\+011f3e-\+011f42\+011f5a\+013440\+013447-\+013455\+01611e-\+01612f\+016af0-\+016af4\+016b30-\+016b36\+016f4f\+016f51-\+016f87\+016f8f-\+016f92\+016fe4\+016ff0-\+016ff1\+01bc9d-\+01bc9e\+01cf00-\+01cf2d\+01cf30-\+01cf46\+01d165-\+01d169\+01d16d-\+01d172\+01d17b-\+01d182\+01d185-\+01d18b\+01d1aa-\+01d1ad\+01d242-\+01d244\+01da00-\+01da36\+01da3b-\+01da6c\+01da75\+01da84\+01da9b-\+01da9f\+01daa1-\+01daaf\+01e000-\+01e006\+01e008-\+01e018\+01e01b-\+01e021\+01e023-\+01e024\+01e026-\+01e02a\+01e08f\+01e130-\+01e136\+01e2ae\+01e2ec-\+01e2ef\+01e4ec-\+01e4ef\+01e5ee-\+01e5ef\+01e6e3\+01e6e6\+01e6ee-\+01e6ef\+01e6f5\+01e8d0-\+01e8d6\+01e944-\+01e94a\+0e0100-\+0e01ef]','','g'));
$$;
create function public.library_text(p_values jsonb) returns text language sql immutable set search_path='' as $$
 select coalesce(string_agg(value,E'\n'),'') from jsonb_array_elements_text(coalesce(p_values,'[]'));
$$;
create function public.library_one_shot(m jsonb, tags jsonb default '[]') returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(m->'one_shot')='boolean' then (m->>'one_shot')::boolean else
 coalesce(m->>'publication_status'='complete' and m->>'published_chapters'='1',false) or exists(
 select 1 from jsonb_array_elements_text(coalesce(m->'ao3_tags','[]')||coalesce(m->'additional_tags','[]')||tags) t
 where trim(t) ~* '^one[- ]?shot$') end;
$$;
-- The browser parser supplies literal ordered substrings, never SQL or regexes.
create function public.library_matches_normalized(p_text text, p_terms jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare g jsonb; term jsonb; part text; matched boolean; group_ok boolean; pos integer; cursor integer; value text:=coalesce(p_text,'');
begin
 if p_terms is null or p_terms='[]'::jsonb then return true; end if;
 for g in select * from jsonb_array_elements(p_terms) loop
  group_ok:=true;
  for term in select * from jsonb_array_elements(g) loop
   cursor:=1; matched:=true;
   for part in select * from jsonb_array_elements_text(term->'parts') loop
    pos:=strpos(substr(value,cursor),part);
    if pos=0 then matched:=false; exit; end if;
    cursor:=cursor+pos-1+length(part);
   end loop;
   if matched=coalesce((term->>'exclude')::boolean,false) then group_ok:=false; exit; end if;
  end loop;
  if group_ok then return true; end if;
 end loop;
 return false;
end;
$$;
create function public.library_matches(p_text text,p_terms jsonb) returns boolean language sql immutable set search_path='' as $$
 select public.library_matches_normalized(public.library_normalize(p_text),p_terms);
$$;
create function public.library_unique_values(p_values jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(value order by first_position),'[]') from
 (select value,min(ordinality) first_position from jsonb_array_elements(p_values) with ordinality group by value) values;
$$;
create function public.library_search_text(s jsonb, p_scope text) returns text language sql immutable set search_path='' as $$
 select case p_scope when 'summary' then s->'metadata'->>'summary' when 'notes' then s->>'notes' else
 public.library_text(jsonb_build_array(s->'metadata'->>'title')
 ||coalesce(s->'metadata'->'authors','[]')||coalesce(s->'metadata'->'fandoms','[]')||coalesce(s->'metadata'->'ao3_tags','[]')
 ||coalesce(s->'metadata'->'relationship_tags','[]')||coalesce(s->'metadata'->'character_tags','[]')||coalesce(s->'metadata'->'additional_tags','[]')
 ||coalesce(s->'personalTags','[]')||coalesce(s->'metadata'->'series','[]')
 ||jsonb_build_array(s->'metadata'->>'summary',s->>'notes',s->'metadata'->>'rating',s->'metadata'->>'publication_status',s->>'reading_status',
 case s->>'reading_status' when 'to_read' then 'To Read' when 'reading' then 'Reading' when 'waiting_for_updates' then 'Waiting for Updates' when 're_reading' then 'Re-reading' when 'finished' then 'Finished' else 'Did Not Finish' end,
 case s->'metadata'->>'publication_status' when 'complete' then 'Complete on AO3' when 'in_progress' then 'In progress on AO3' when 'abandoned' then 'Abandoned' else 'AO3 Status Unknown' end,
 case when public.library_one_shot(s->'metadata',coalesce(s->'personalTags','[]')) then 'One-shot' else '' end,
 s->'work'->>'ao3_updated_at',s->>'original_url')) end;
$$;
create function public.library_filter(s jsonb, f jsonb, terms jsonb, p_search text default null) returns boolean language sql stable set search_path='' as $$
 select
 (coalesce(f->>'query','')='' or strpos(public.library_normalize(coalesce(s->>'queryText',public.library_text(jsonb_build_array(s->'metadata'->>'title')||coalesce(s->'metadata'->'authors','[]')))),public.library_normalize(trim(f->>'query')))>0)
 and (coalesce(f->'fandoms','[]')='[]'::jsonb or exists(select 1 from jsonb_array_elements_text(f->'fandoms') v where s->'metadata'->'fandoms' ? v))
 and (coalesce(f->'publication','[]')='[]'::jsonb or f->'publication' ? (s->'metadata'->>'publication_status'))
 and (coalesce(f->>'oneShot','allowed')='allowed' or coalesce(s->'oneShots',jsonb_build_array(public.library_one_shot(s->'metadata',coalesce(s->'personalTags','[]')))) @> jsonb_build_array(f->>'oneShot'='only'))
 and (not coalesce((f->>'inSeries')::boolean,false) or coalesce(s->'metadata'->'series','[]')<>'[]'::jsonb or coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb)
 and (coalesce(f->'rating','[]')='[]'::jsonb or exists(select 1 from jsonb_array_elements_text(f->'rating') v where coalesce(s->'ratings',jsonb_build_array(s->'metadata'->>'rating')) ? v))
 and (not coalesce((f->>'favorites')::boolean,false) or (s->>'is_favorite')::boolean)
 and (coalesce(f->>'relationship','')='' and coalesce(f->>'characters','')='' and coalesce(f->>'tags','')='' or not exists(select 1 from jsonb_each_text(jsonb_build_object('relationship_tags',coalesce(f->>'relationship',''),'character_tags',coalesce(f->>'characters',''),'additional_tags',coalesce(f->>'tags',''))) field,
 unnest(string_to_array(public.library_normalize(field.value),',')) term where trim(term)<>'' and not exists(
 select 1 from jsonb_array_elements_text(coalesce(s->'metadata'->field.key,'[]')) tag where strpos(public.library_normalize(tag),trim(term))>0)))
 and (coalesce(f->>'updatedAfter','')='' or (s->'work'->>'ao3_updated_at')::timestamptz >= ((f->>'updatedAfter')::date::timestamp at time zone 'UTC'))
 and (coalesce(f->>'updatedBefore','')='' or (s->'work'->>'ao3_updated_at')::timestamptz < (((f->>'updatedBefore')::date+1)::timestamp at time zone 'UTC'))
 and (terms is null or terms='[]'::jsonb or public.library_matches_normalized(coalesce(p_search,public.library_normalize(public.library_search_text(s,coalesce(f->>'scope','any'))||case when f->>'scope'='any' then coalesce(s->>'extraSearch','') else '' end)),terms));
$$;
create function public.library_in_shelf(s jsonb, shelf text, mode text) returns boolean language sql stable set search_path='' as $$
 select case when mode='reading' then
 case shelf when 'to_read' then s->>'reading_status'='to_read'
 when 'complete' then s->>'reading_status' in ('reading','re_reading') and s->'metadata'->>'publication_status'='complete'
 when 'in_progress' then s->>'reading_status' in ('reading','re_reading') and s->'metadata'->>'publication_status'='in_progress'
 when 'waiting' then s->>'reading_status'='waiting_for_updates'
 when 'new' then s->>'last_update_notification_at' is not null and (s->>'update_dismissed_at' is null or (s->>'last_update_notification_at')::timestamptz>(s->>'update_dismissed_at')::timestamptz)
 and (s->'metadata'->>'published_chapters')::integer>(s->>'last_read_chapter')::integer
 and s->'work'->'verified_chapters'->>((s->>'last_read_chapter')::integer+1)::text ~ '^[1-9][0-9]*$'
 else s->>'reading_status' in ('reading','re_reading','waiting_for_updates') end
 else case shelf when 'all' then s->>'id' not like 'series:%'
 when 'series' then s->>'id' like 'series:%'
 when 'currently_reading' then s->>'reading_status' in ('reading','re_reading','waiting_for_updates')
 when 'favorites' then (s->>'is_favorite')::boolean
 when 'to_read' then s->>'reading_status'='to_read'
 when 'finished' then s->>'reading_status'='finished'
 when 'did_not_finish' then s->>'reading_status'='did_not_finish'
 else coalesce(s->'collectionIds','[]') ? shelf end end;
$$;

create index library_entries_user_added_page_idx on public.library_entries(user_id,created_at desc,id);
create index import_batches_owner_history_idx on public.import_batches(user_id,created_at desc,id);
create index metadata_jobs_owner_due_idx on public.metadata_jobs(user_id,next_attempt_at,created_at,id) where status in ('pending','processing');

-- Series use the same private effective work documents, including corrections to
-- saved installments and private notes; unsaved preview works remain searchable.
create function public.library_series_results(p_stories jsonb) returns table(story jsonb, payload jsonb)
language sql stable set search_path='' as $$
 with saved as materialized (select value s, value->'metadata' m from jsonb_array_elements(p_stories)),
 records as materialized (select r.*,to_jsonb(r)||jsonb_build_object('collectionIds',coalesce((select jsonb_agg(collection_id order by collection_id) from public.collection_series where library_series_id=r.id),'[]')) record from public.library_series r where user_id=(select auth.uid())),
 memberships as (select distinct (v->>'id')::bigint sid, s->>'id' id, v->>'name' name from saved cross join lateral jsonb_array_elements(coalesce(m->'series_memberships','[]')) v where v->>'url'='https://archiveofourown.org/series/'||(v->>'id')),
 linked as (select sid,id from memberships union select r.ao3_series_id,s->>'id' from records r cross join lateral jsonb_array_elements(r.metadata->'works') w join saved on s->'work'->>'ao3_work_id'=w->>'workId'),
 candidates as (select sid,min(name) title from memberships group by sid union select ao3_series_id,metadata->>'title' from records where exists(select 1 from linked where sid=ao3_series_id) or is_favorite or reading_status='finished' or notes<>'' or record->'collectionIds'<>'[]'::jsonb),
 groups as (select c.sid,coalesce(max(r.metadata->>'title'),min(c.title)) title,max(r.record::text)::jsonb record,max(r.metadata::text)::jsonb preview,
 coalesce((select jsonb_agg(s order by s->>'id') from saved join linked l on l.id=s->>'id' where l.sid=c.sid),'[]') saved
 from candidates c left join records r on r.ao3_series_id=c.sid group by c.sid),
 previews as (select g.*,
 (select coalesce(jsonb_agg(w order by (w->>'position')::integer nulls last,ordinal),'[]') from (
 select coalesce(p.w,'{}') || case when s is null then '{}'::jsonb else jsonb_build_object(
 'workId',s->'work'->'ao3_work_id','url','https://archiveofourown.org/works/'||(s->'work'->>'ao3_work_id'),
 'position',coalesce((select v->'position' from jsonb_array_elements(coalesce(s->'metadata'->'series_memberships','[]')) v where v->>'id'=g.sid::text limit 1),p.w->'position','null'),
 'title',s->'metadata'->'title','authors',s->'metadata'->'authors','rating',s->'metadata'->'rating',
 'relationshipTags',s->'metadata'->'relationship_tags','characterTags',s->'metadata'->'character_tags','additionalTags',s->'metadata'->'additional_tags',
 'fandoms',s->'metadata'->'fandoms','summary',s->'metadata'->'summary','tags',s->'metadata'->'ao3_tags','wordCount',s->'metadata'->'word_count',
 'updated',coalesce(left(s->'work'->>'ao3_updated_at',10),p.w->>'updated'),
 'chapters',coalesce(s->'metadata'->>'published_chapters','?')||'/'||coalesce(s->'metadata'->>'total_chapters','?'),
 'complete',case s->'metadata'->>'publication_status' when 'unknown' then null else s->'metadata'->>'publication_status'='complete' end) end w, coalesce(p.ordinal,2147483647) ordinal
 from (select value w,ordinality ordinal from jsonb_array_elements(coalesce(g.preview->'works','[]')) with ordinality) p
 full join jsonb_array_elements(g.saved) s on s->'work'->>'ao3_work_id'=p.w->>'workId'
 ) works) works from groups g),
 aggregates as (select p.*,jsonb_build_object(
 'title',title,'authors',public.library_unique_values(coalesce(preview->'creators','[]')||jsonb_path_query_array(works,'$[*].authors[*]')),
 'fandoms',public.library_unique_values(jsonb_path_query_array(works,'$[*].fandoms[*]')),
 'summary',concat_ws(E'\n',preview->>'description',preview->>'creatorNotes',(select string_agg(w->>'summary',E'\n') from jsonb_array_elements(works) w)),
 'rating','','series',jsonb_build_array(title),
 'ao3_tags',public.library_unique_values(jsonb_path_query_array(works,'$[*].tags[*]')),
 'relationship_tags',public.library_unique_values(jsonb_path_query_array(works,'$[*].relationshipTags[*]')),
 'character_tags',public.library_unique_values(jsonb_path_query_array(works,'$[*].characterTags[*]')),
 'additional_tags',public.library_unique_values(jsonb_path_query_array(coalesce((select jsonb_agg(coalesce(nullif(w->'additionalTags','null'),w->'tags','[]')) from jsonb_array_elements(works) w),'[]'),'$[*][*]')),
 'publication_status',case preview->>'complete' when 'true' then 'complete' when 'false' then 'in_progress' else 'unknown' end,
 'published_chapters',(select case when count(*)=0 or bool_and(w->>'chapters' ~ '^[0-9]+/') then coalesce(sum(case when w->>'chapters' ~ '^[0-9]+/' then split_part(w->>'chapters','/',1)::integer end),0) else null end from jsonb_array_elements(works) w),
 'total_chapters',(select case when count(*)=0 or bool_and(w->>'chapters' ~ '^[0-9]+/') then coalesce(sum(case when w->>'chapters' ~ '^[0-9]+/' then split_part(w->>'chapters','/',1)::integer end),0) else null end from jsonb_array_elements(works) w),
 'word_count',preview->'wordCount') m,
 case when saved='[]'::jsonb then case when record->>'reading_status'='finished' then 'finished' else 'to_read' end
 when not exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'<>'to_read') then 'to_read'
 when not exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'<>'finished') then 'finished'
 when not exists(select 1 from jsonb_array_elements(saved) s where s->>'reading_status'<>'did_not_finish') then 'did_not_finish' else 'reading' end status from previews p)
 select jsonb_build_object('id','series:'||sid,'metadata',m,'original_url','https://archiveofourown.org/series/'||sid,
 'created_at',coalesce(record->>'created_at',saved->0->>'created_at',''),'updated_at',record->>'updated_at',
 'work',jsonb_build_object('ao3_updated_at',case when preview->>'updated' is not null then preview->>'updated'||'T00:00:00Z' else null end,'verified_chapters','{}'::jsonb),
 'reading_status',status,'is_favorite',coalesce((record->>'is_favorite')::boolean,false),
 'collectionIds',coalesce(record->'collectionIds','[]'),'personalTags',public.library_unique_values(jsonb_path_query_array(saved,'$[*].personalTags[*]')),
 'notes',concat_ws(E'\n',nullif(record->>'notes',''),(select string_agg(s->>'notes',E'\n') from jsonb_array_elements(saved) s)),
 'last_read_chapter',(select coalesce(sum((s->>'last_read_chapter')::integer),0) from jsonb_array_elements(saved) s),
 'queryText',concat_ws(E'\n',title,public.library_text(preview->'creators'),(select string_agg(concat_ws(E'\n',w->>'title',public.library_text(w->'authors')),E'\n') from jsonb_array_elements(works) w)),
 'ratings',(select coalesce(jsonb_agg(distinct w->>'rating'),'[]') from jsonb_array_elements(works) w),
 'oneShots',(select coalesce(jsonb_agg(distinct (coalesce(w->>'complete'='true',false) and w->>'chapters'='1/1' or exists(select 1 from jsonb_array_elements_text(coalesce(w->'tags','[]')||coalesce(nullif(w->'additionalTags','null'),'[]')) t where trim(t) ~* '^one[- ]?shot$'))),'[]') from jsonb_array_elements(works) w),
 'extraSearch',(select string_agg(concat_ws(E'\n',w->>'title',w->>'url',w->>'rating',w->>'chapters',w->>'updated'),E'\n') from jsonb_array_elements(works) w)),
 coalesce(preview,'{}')||jsonb_build_object('seriesId',sid,'title',title,'normalizedUrl','https://archiveofourown.org/series/'||sid,
 'description',coalesce(preview->>'description',''),'creators',coalesce(preview->'creators',m->'authors'),'works',works,
 'record',record,'savedStories',saved,'fandoms',m->'fandoms','detailsLoaded',preview is not null)
 from aggregates;
$$;

-- Normalize the large text fields once per source change rather than once
-- per work on every search. These remain private under the document policy.
alter table public.library_search_documents
 add column search_any text generated always as (public.library_normalize(public.library_search_text(story,'any'))) stored,
 add column search_summary text generated always as (public.library_normalize(story->'metadata'->>'summary')) stored,
 add column search_notes text generated always as (public.library_normalize(story->>'notes')) stored;

create function public.query_library(p_query jsonb default '{}', p_page integer default 1, p_size integer default 50)
returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if p_size not in (25,50,100,250) or p_page<1 then raise exception 'Invalid pagination' using errcode='22023'; end if;
 with works as materialized (select story s,search_any,search_summary,search_notes from public.library_search_documents where user_id=(select auth.uid())),
 series_work_ids as materialized (select distinct w->>'workId' id from public.library_series r cross join lateral jsonb_array_elements(r.metadata->'works') w where r.user_id=(select auth.uid()) and p_query->>'mode'<>'reading' and p_query->>'shelf'<>'all'),
 series as materialized (select * from public.library_series_results(coalesce((select jsonb_agg(s) from works where p_query->>'mode'<>'reading' and p_query->>'shelf'<>'all' and (coalesce(s->'metadata'->'series_memberships','[]')<>'[]'::jsonb or s->'work'->>'ao3_work_id' in (select id from series_work_ids))),'[]')) where p_query->>'mode'<>'reading' and p_query->>'shelf'<>'all'),
 documents as materialized (select s,null::jsonb payload,search_any,search_summary,search_notes from works union all select story,payload,public.library_normalize(public.library_search_text(story,'any')||coalesce(story->>'extraSearch','')),public.library_normalize(story->'metadata'->>'summary'),public.library_normalize(story->>'notes') from series),
 pool as materialized (select * from documents where case when p_query->>'mode'='reading' then s->>'id' not like 'series:%' and s->>'reading_status' in ('reading','re_reading','waiting_for_updates','to_read') else public.library_in_shelf(s,coalesce(p_query->>'shelf','all'),'library') end),
 filtered as materialized (select * from pool where public.library_filter(s,coalesce(p_query->'filters','{}'),p_query->'terms',case p_query->'filters'->>'scope' when 'summary' then search_summary when 'notes' then search_notes else search_any end)),
 selected as materialized (select * from filtered where p_query->>'mode'<>'reading' or public.library_in_shelf(s,coalesce(p_query->>'shelf','view_all'),'reading')),
 totals as (select count(*) total,greatest(1,ceil(count(*)::numeric/p_size)::integer) pages from selected),
 ordered as (select *,row_number() over(order by
 case when p_query->'filters'->>'sort'='alpha' then s->'metadata'->>'title' end collate "und-x-icu" asc,
 case when p_query->'filters'->>'sort'='alpha_reverse' then s->'metadata'->>'title' end collate "und-x-icu" desc,
 case when coalesce(p_query->'filters'->>'sort','added')='added' then nullif(s->>'created_at','')::timestamptz end desc nulls last,
 case when p_query->'filters'->>'sort'='added_reverse' then nullif(s->>'created_at','')::timestamptz end asc nulls last,
 case when p_query->'filters'->>'sort'='updated' then (s->'work'->>'ao3_updated_at')::timestamptz end desc nulls last,
 case when p_query->'filters'->>'sort'='updated_reverse' then (s->'work'->>'ao3_updated_at')::timestamptz end asc nulls last,
 case when p_query->'filters'->>'sort'='ready' then case when s->'metadata'->>'published_chapters' is not null then greatest(0,(s->'metadata'->>'published_chapters')::integer-(s->>'last_read_chapter')::integer) end end desc nulls last,
 case when p_query->'filters'->>'sort'='ready_reverse' then case when s->'metadata'->>'published_chapters' is not null then greatest(0,(s->'metadata'->>'published_chapters')::integer-(s->>'last_read_chapter')::integer) end end asc nulls last,
 s->'metadata'->>'title' collate "und-x-icu",s->>'id' collate "C") n from selected),
 page as (select ordered.* from ordered,totals where n> (least(p_page,pages)-1)*p_size and n<=least(p_page,pages)*p_size order by n)
 select jsonb_build_object('total',total,'page',least(p_page,pages),'pages',pages,
 'stories',coalesce((select jsonb_agg(s-'queryText'-'oneShots'-'ratings'-'extraSearch'-'extension_metadata'-'extension_chapters'-'metadata_overrides'
 ||jsonb_build_object('metadata_overrides','{}'::jsonb,'work',jsonb_build_object('id',s->'work'->'id','ao3_work_id',s->'work'->'ao3_work_id','ao3_updated_at',s->'work'->'ao3_updated_at','verified_chapters',case when s->'work'->'verified_chapters' ? ((s->>'last_read_chapter')::integer+1)::text then jsonb_build_object(((s->>'last_read_chapter')::integer+1)::text,s->'work'->'verified_chapters'->((s->>'last_read_chapter')::integer+1)::text) else '{}'::jsonb end)) order by n) from page),'[]'),
 'series',coalesce((select jsonb_agg(payload||jsonb_build_object('record',(payload->'record')-'metadata','savedStories',(select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','reading_status',v->'reading_status','last_read_chapter',v->'last_read_chapter','work',jsonb_build_object('id',v->'work'->'id','ao3_work_id',v->'work'->'ao3_work_id'))),'[]') from jsonb_array_elements(payload->'savedStories') v)) order by n) from page where payload is not null),'[]'),
 'sections',case when p_query->>'mode'='reading' then (select jsonb_object_agg(k,(select count(*) from filtered where public.library_in_shelf(s,k,'reading'))) from unnest(array['complete','in_progress','new','view_all','waiting','to_read']) k) else '{}'::jsonb end,
 'suggestions',jsonb_build_object('relationships',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'relationship_tags','[]'))) t),'characters',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'character_tags','[]'))) t),'tags',(select coalesce(jsonb_agg(name order by name),'[]') from (select distinct value name from pool cross join lateral jsonb_array_elements_text(coalesce(s->'metadata'->'additional_tags','[]'))) t)),
 'fandoms',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'count',c) order by name),'[]') from (select name,count(*) c from pool cross join lateral (select distinct value name from jsonb_array_elements_text(s->'metadata'->'fandoms')) names group by name) f)) into result from totals;
 return result;
end;
$$;

-- A compact identity/organization catalog supports import deduplication and the
-- existing collection picker without transferring summaries, notes or tag blobs.
create function public.library_catalog() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('stories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'work_id',work_id,
 'work',jsonb_build_object('id',work_id,'ao3_work_id',story->'work'->'ao3_work_id'),'created_at',story->'created_at','updated_at',story->'updated_at','last_read_chapter',story->'last_read_chapter',
 'metadata',jsonb_build_object('title',story->'metadata'->'title','authors',story->'metadata'->'authors','fandoms',story->'metadata'->'fandoms','series',story->'metadata'->'series','series_memberships',story->'metadata'->'series_memberships','publication_status',story->'metadata'->'publication_status'),
 'reading_status',story->'reading_status','is_favorite',story->'is_favorite','collectionIds',story->'collectionIds')) from public.library_search_documents where user_id=(select auth.uid())),'[]'),
 'collections',coalesce((select jsonb_agg(to_jsonb(c) order by sort_position,created_at,id) from public.collections c where user_id=(select auth.uid())),'[]'),
 'series',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('metadata',r.metadata||jsonb_build_object('description','','creatorNotes','','works',(select coalesce(jsonb_agg((v-'summary'-'tags'-'relationshipTags'-'characterTags'-'additionalTags')||jsonb_build_object('summary','','tags','[]'::jsonb)),'[]') from jsonb_array_elements(r.metadata->'works') v)),'collectionIds',coalesce((select jsonb_agg(collection_id) from public.collection_series where library_series_id=r.id),'[]'))) from public.library_series r where user_id=(select auth.uid())),'[]'));
$$;
create function public.library_story_details(p_ids uuid[]) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(story),'[]') from public.library_search_documents where id=any(p_ids) and user_id=(select auth.uid());
$$;
revoke all on function public.query_library(jsonb,integer,integer),public.library_catalog(),public.library_story_details(uuid[]),public.library_series_results(jsonb) from public,anon;
grant execute on function public.query_library(jsonb,integer,integer),public.library_catalog(),public.library_story_details(uuid[]),public.library_series_results(jsonb) to authenticated;
-- Helpers accept only supplied values and cannot access any tables.
revoke all on function public.library_normalize(text),public.library_text(jsonb),public.library_unique_values(jsonb),public.library_one_shot(jsonb,jsonb),public.library_matches(text,jsonb),public.library_matches_normalized(text,jsonb),public.library_search_text(jsonb,text),public.library_filter(jsonb,jsonb,jsonb,text),public.library_in_shelf(jsonb,text,text) from public,anon;
grant execute on function public.library_normalize(text),public.library_text(jsonb),public.library_unique_values(jsonb),public.library_one_shot(jsonb,jsonb),public.library_matches(text,jsonb),public.library_matches_normalized(text,jsonb),public.library_search_text(jsonb,text),public.library_filter(jsonb,jsonb,jsonb,text),public.library_in_shelf(jsonb,text,text) to authenticated;
commit;
