begin;

alter table public.collections add column automatic_rules jsonb;

create function public.validate_automatic_collection_rules() returns trigger
language plpgsql set search_path='' as $$
declare f jsonb; key text; value jsonb; group_value jsonb; term jsonb;
begin
 if new.automatic_rules is null then return new; end if;
 f := new.automatic_rules->'filters';
 if new.default_key is not null or jsonb_typeof(new.automatic_rules)<>'object'
  or jsonb_typeof(f) is distinct from 'object'
  or jsonb_typeof(new.automatic_rules->'terms') is distinct from 'array'
  or octet_length(new.automatic_rules::text)>65536 then
  raise check_violation using message='Invalid automatic collection rules.';
 end if;
 for key,value in select * from jsonb_each(f) loop
  if key in ('fandoms','publication','rating') then
   if jsonb_typeof(value)<>'array' then raise check_violation using message='Invalid collection filter list.'; end if;
   if exists(select 1 from jsonb_array_elements(value) v where jsonb_typeof(v)<>'string') then raise check_violation using message='Invalid collection filter value.'; end if;
  elsif key in ('inSeries','favorites') then
   if jsonb_typeof(value)<>'boolean' then raise check_violation using message='Invalid collection filter flag.'; end if;
  elsif key in ('query','oneShot','relationship','characters','tags','updatedAfter','updatedBefore','within','scope','sort','groupBy') then
   if jsonb_typeof(value)<>'string' then raise check_violation using message='Invalid collection filter text.'; end if;
  else raise check_violation using message='Unknown collection filter.';
  end if;
 end loop;
 if coalesce(f->>'scope','any') not in ('any','summary','notes') or coalesce(f->>'oneShot','allowed') not in ('allowed','only','exclude') then
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
 for group_value in select * from jsonb_array_elements(new.automatic_rules->'terms') loop
  if jsonb_typeof(group_value)<>'array' then raise check_violation using message='Invalid collection search group.'; end if;
  for term in select * from jsonb_array_elements(group_value) loop
   if jsonb_typeof(term)<>'object' or jsonb_typeof(term->'parts') is distinct from 'array' or jsonb_typeof(term->'exclude') is distinct from 'boolean' then
    raise check_violation using message='Invalid collection search term.';
   end if;
   if exists(select 1 from jsonb_array_elements(term->'parts') v where jsonb_typeof(v)<>'string') then raise check_violation using message='Invalid collection search text.'; end if;
  end loop;
 end loop;
 return new;
end;
$$;
create trigger validate_automatic_collection_rules before insert or update of automatic_rules,default_key on public.collections
 for each row execute function public.validate_automatic_collection_rules();

-- Membership is evaluated from the private, effective saved metadata. No copied
-- memberships or background jobs can fall behind imports, corrections or edits.
create function public.automatic_collection_ids(s jsonb,p_owner uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.collections c
 where c.user_id=p_owner and c.default_key is null and c.automatic_rules is not null
 and public.library_filter(s,c.automatic_rules->'filters',c.automatic_rules->'terms');
$$;
create view public.library_collection_documents with (security_invoker=true) as
 select id,user_id,work_id,story||jsonb_build_object('automaticCollectionIds',public.automatic_collection_ids(story,user_id)) story,search_any,search_summary,search_notes
 from public.library_search_documents;
grant select on public.library_collection_documents to authenticated;

-- Reuse the established pagination, count, filter, catalog and detail queries.
do $migration$
declare signature regprocedure; definition text; updated text;
begin
 foreach signature in array array['public.query_library(jsonb,integer,integer)'::regprocedure,
 'public.library_catalog()'::regprocedure,'public.library_story_details(uuid[])'::regprocedure] loop
  select pg_get_functiondef(signature) into definition;
  updated := replace(definition,'public.library_search_documents','public.library_collection_documents');
  if updated=definition then raise exception 'Review automatic collection document consumer: %',signature; end if;
  updated := replace(updated,$old$'collectionIds',story->'collectionIds'$old$,$new$'collectionIds',story->'collectionIds','automaticCollectionIds',story->'automaticCollectionIds'$new$);
  execute updated;
 end loop;
 select pg_get_functiondef('public.library_in_shelf(jsonb,text,text)'::regprocedure) into definition;
 updated := replace(definition,$old$coalesce(s->'collectionIds','[]') ? shelf$old$,
 $new$(coalesce(s->'collectionIds','[]') ? shelf or coalesce(s->'automaticCollectionIds','[]') ? shelf)$new$);
 if updated=definition then raise exception 'Review automatic collection shelf matching'; end if;
 execute updated;
end;
$migration$;

-- Device collection pickers expose only collections with manual membership.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition,'from public.collections where user_id=device.user_id and default_key is null',
 'from public.collections where user_id=device.user_id and default_key is null and automatic_rules is null');
 if updated=definition then raise exception 'Review device collection picker'; end if;
 execute updated;
end;
$migration$;

create function public.guard_automatic_collection_membership() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.collections where id=new.collection_id and automatic_rules is not null) then
  raise check_violation using message='Automatic collection membership is determined by its filters.';
 end if;
 return new;
end;
$$;
create trigger guard_automatic_work_membership before insert or update on public.collection_works
 for each row execute function public.guard_automatic_collection_membership();
create trigger guard_automatic_series_membership before insert or update on public.collection_series
 for each row execute function public.guard_automatic_collection_membership();
create function public.clear_automatic_manual_memberships() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.automatic_rules is not null then
  delete from public.collection_works where collection_id=new.id and user_id=new.user_id;
  delete from public.collection_series where collection_id=new.id and user_id=new.user_id;
 end if;
 return new;
end;
$$;
create trigger clear_automatic_manual_memberships after update of automatic_rules on public.collections
 for each row execute function public.clear_automatic_manual_memberships();

revoke all on function public.automatic_collection_ids(jsonb,uuid),public.validate_automatic_collection_rules(),public.guard_automatic_collection_membership(),public.clear_automatic_manual_memberships() from public,anon;
grant execute on function public.automatic_collection_ids(jsonb,uuid),public.validate_automatic_collection_rules(),public.guard_automatic_collection_membership(),public.clear_automatic_manual_memberships() to authenticated;
commit;
