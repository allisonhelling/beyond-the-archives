begin;

-- An ordinary editable/deletable automatic collection. No protected default key.
create function public.seed_original_works_collection(p_user_id uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.collections(user_id,name,color,symbol,automatic_rules,sort_position)
 select p_user_id,'Original Works','#07534a','book',
  '{"filters":{"fandoms":["Original Work","Original Works"]},"terms":[]}'::jsonb,
  coalesce(max(sort_position),-1)+1
 from public.collections where user_id=p_user_id
 on conflict(user_id,name) do nothing;
$$;
revoke all on function public.seed_original_works_collection(uuid) from public,anon,authenticated;

create or replace function public.initialize_library_collections() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.seed_starter_collection(new.id);
 perform public.seed_original_works_collection(new.id);
 return new;
end;
$$;

-- One-time backfill only. Do not resurrect deleted One Shots or seed during reads/restore.
select public.seed_original_works_collection(id) from auth.users;

commit;
