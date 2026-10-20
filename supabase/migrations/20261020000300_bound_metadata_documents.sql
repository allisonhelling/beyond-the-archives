begin;

-- Metadata completion writes several source rows. Collect entry identities until
-- the operation is complete so each projection sees the final metadata once.
create or replace function public.refresh_library_documents(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('app.defer_library_documents',true)='on' then
  perform set_config('app.library_document_ids',
   (select coalesce(array_agg(distinct id) filter(where id is not null),'{}'::uuid[])::text
    from unnest(coalesce(nullif(current_setting('app.library_document_ids',true),'')::uuid[],'{}'::uuid[]) || p_ids) id),true);
  return;
 end if;
 insert into public.library_search_documents as cached(id,user_id,work_id,story)
 select id,user_id,work_id,story from public.library_story_documents where id=any(p_ids)
 on conflict(id) do update set user_id=excluded.user_id,work_id=excluded.work_id,story=excluded.story
 where (cached.user_id,cached.work_id,cached.story) is distinct from (excluded.user_id,excluded.work_id,excluded.story);
end;
$$;

create function public.flush_library_documents() returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[] := nullif(current_setting('app.library_document_ids',true),'')::uuid[];
begin
 perform set_config('app.defer_library_documents','off',true);
 perform set_config('app.library_document_ids','',true);
 if cardinality(ids)>0 then perform public.refresh_library_documents(ids); end if;
end;
$$;
revoke all on function public.flush_library_documents() from public,anon,authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.sync_library_documents()'::regprocedure) into definition;
 updated := replace(definition, $old$ if tg_table_name='library_entries' then$old$,
  $new$ if tg_op='UPDATE' and (old_row=new_row or
  (tg_table_name in ('authors','fandoms','tags','personal_tags') and old_row-'updated_at'=new_row-'updated_at')) then
  return null;
 end if;
 if tg_table_name='library_entries' then$new$);
 if updated=definition then raise exception 'Review search document trigger'; end if;
 execute updated;

 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated := replace(definition,
  $old$on conflict on constraint fandoms_name_key do update set name=excluded.name returning id into relation_id;$old$,
  $new$on conflict on constraint fandoms_name_key do nothing returning id into relation_id;
    if relation_id is null then select id into relation_id from public.fandoms where name=v_name; end if;$new$);
 updated := replace(updated,
  $old$on conflict on constraint tags_name_category_key do update set name=excluded.name returning id into relation_id;$old$,
  $new$on conflict on constraint tags_name_category_key do nothing returning id into relation_id;
    if relation_id is null then select id into relation_id from public.tags where name=v_name and category=v_category; end if;$new$);
 updated := replace(updated, $old$ update public.works set last_metadata_check=now()$old$,
  $new$ perform set_config('app.defer_library_documents','on',true);
 update public.works set last_metadata_check=now()$new$);
 updated := replace(updated, ' return true;', ' perform public.flush_library_documents(); return true;');
 if updated=definition or position('do update set name=excluded.name' in updated)>0
  or position('app.defer_library_documents' in updated)=0 or position('perform public.flush_library_documents()' in updated)=0 then
  raise exception 'Review metadata completion batching';
 end if;
 execute updated;

 -- Browser refreshes also update the private layer in multiple statements.
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated := replace(definition, $old$   update public.library_entries set
    extension_metadata=extension_metadata || metadata$old$,
  $new$   perform set_config('app.defer_library_documents','on',true);
   update public.library_entries set
    extension_metadata=extension_metadata || metadata$new$);
 updated := replace(updated, $old$   entry_id := entry.id;
  elsif p_action='progress' then$old$,
  $new$   perform public.flush_library_documents();
   entry_id := entry.id;
  elsif p_action='progress' then$new$);
 if updated=definition or position('app.defer_library_documents' in updated)=0 or position('perform public.flush_library_documents()' in updated)=0 then
  raise exception 'Review userscript metadata batching';
 end if;
 execute updated;
end;
$migration$;
commit;
