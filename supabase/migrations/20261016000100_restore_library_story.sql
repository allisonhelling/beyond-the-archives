-- Restore a removed private entry and its surviving memberships in one transaction.
create function public.restore_library_story(p_entry jsonb, p_collections uuid[], p_tags text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare restored public.library_entries;
begin
  restored := jsonb_populate_record(null::public.library_entries, p_entry);
  if auth.uid() is null or restored.user_id is distinct from auth.uid() then
    raise exception 'Story unavailable' using errcode = '42501';
  end if;
  -- Keep the existing save boundary: no direct browser INSERT grant, and an AO3
  -- URL must identify the exact work being restored. Never modify shared works.
  if restored.original_url is null or trim(restored.original_url) !~ '^https?://(www\.)?archiveofourown\.org/works/[1-9][0-9]*(/chapters/[1-9][0-9]*)?/?([?#][^[:space:]]*)?$'
    or not exists (select 1 from public.works w where w.id = restored.work_id
      and w.ao3_work_id = substring(trim(restored.original_url) from '/works/([1-9][0-9]*)')::bigint) then
    raise exception 'Work identity does not match the original AO3 URL' using errcode = '22023';
  end if;
  insert into public.library_entries select (restored).*;
  insert into public.collection_works(user_id, collection_id, library_entry_id)
    select auth.uid(), c.id, restored.id from public.collections c
    where c.user_id = auth.uid() and c.id = any(p_collections);
  insert into public.library_entry_tags(user_id, library_entry_id, personal_tag_id)
    select auth.uid(), restored.id, t.id from public.personal_tags t
    where t.user_id = auth.uid() and t.name = any(p_tags);
  return restored.id;
end;
$$;
revoke all on function public.restore_library_story(jsonb,uuid[],text[]) from public, anon;
grant execute on function public.restore_library_story(jsonb,uuid[],text[]) to authenticated;
