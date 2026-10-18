alter table public.collections add column sort_position integer check (sort_position >= 0);

create function public.reorder_collections(p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- RLS and explicit ownership keep the entire operation private and atomic.
  perform 1 from public.collections where user_id = auth.uid() and default_key is null for update;
  if p_ids is null
    or cardinality(p_ids) <> (select count(*) from public.collections where user_id = auth.uid() and default_key is null)
    or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id)
    or exists (select 1 from unnest(p_ids) as requested(id) where not exists (
      select 1 from public.collections c where c.id = requested.id and c.user_id = auth.uid() and c.default_key is null
    )) then
    raise exception 'Collections changed. Reload your library and try again.';
  end if;
  update public.collections c set sort_position = ordered.position - 1
    from unnest(p_ids) with ordinality as ordered(id, position)
    where c.id = ordered.id and c.user_id = auth.uid() and c.default_key is null;
end;
$$;
revoke all on function public.reorder_collections(uuid[]) from public, anon;
grant execute on function public.reorder_collections(uuid[]) to authenticated;
