begin;

-- A starter example is an ordinary custom collection, not a protected default.
-- Provision once, never on library reads, so edits and deletions remain permanent.
create function public.seed_starter_collection(p_user_id uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.collections(user_id,name,color,symbol,automatic_rules,sort_position)
 select p_user_id,'One Shots','#8b491e','scroll',
  '{"filters":{"query":"","fandoms":[],"publication":[],"oneShot":"only","inSeries":false,"rating":[],"favorites":false,"relationship":"","characters":"","tags":"","updatedAfter":"","updatedBefore":"","within":"","scope":"any","sort":"added","groupBy":"none"},"terms":[]}'::jsonb,
  coalesce(max(sort_position),-1)+1
 from public.collections where user_id=p_user_id
 on conflict(user_id,name) do nothing;
$$;

create function public.initialize_library_collections() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.seed_starter_collection(new.id);
 return new;
end;
$$;
create trigger initialize_library_collections after insert on auth.users
 for each row execute function public.initialize_library_collections();

revoke all on function public.seed_starter_collection(uuid),public.initialize_library_collections() from public,anon,authenticated;

-- Existing accounts receive the example without replacing a same-named shelf.
select public.seed_starter_collection(id) from auth.users;

commit;
