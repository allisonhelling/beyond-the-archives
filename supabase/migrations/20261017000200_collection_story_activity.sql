begin;
-- Only a new story membership changes collection addition activity.
alter table public.collections add column last_story_added_at timestamptz;
update public.collections c set last_story_added_at = (
  select max(m.created_at) from public.collection_works m where m.collection_id = c.id and m.user_id = c.user_id
);

create function public.record_collection_story_added()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.collections set last_story_added_at = greatest(last_story_added_at, new.created_at)
    where id = new.collection_id and user_id = new.user_id;
  return new;
end;
$$;
revoke all on function public.record_collection_story_added() from public, anon;
grant execute on function public.record_collection_story_added() to authenticated;
create trigger record_collection_story_added after insert on public.collection_works
  for each row execute function public.record_collection_story_added();

-- Preserve existing memberships rather than deleting/recreating them on every story save.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.save_library_story(text,jsonb,public.reading_status,integer,text,smallint,boolean,uuid[],text[],uuid)'::regprocedure) into definition;
  updated := replace(definition,
    'delete from public.collection_works where library_entry_id=entry_uuid and user_id=owner_id;',
    'delete from public.collection_works where library_entry_id=entry_uuid and user_id=owner_id and not (collection_id = any(coalesce(p_collections, array[]::uuid[])));');
  if updated = definition then raise exception 'Collection removal block changed; review migration'; end if;
  definition := updated;
  updated := replace(definition,
    'select owner_id,c,entry_uuid from (select distinct unnest(p_collections) c) chosen;',
    'select owner_id,c,entry_uuid from (select distinct unnest(p_collections) c) chosen on conflict (collection_id, library_entry_id) do nothing;');
  if updated = definition then raise exception 'Collection insertion block changed; review migration'; end if;
  execute updated;
end $migration$;
commit;
