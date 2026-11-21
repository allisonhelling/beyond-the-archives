begin;

-- Project rows before aggregating them, and assemble the snapshot once. This
-- avoids expanding whole tables back out of JSON and copying the accumulated
-- snapshot on each pass. Keep the existing allowlist and restore format.
create or replace function public.export_library_backup() returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='60s' as $$
declare
 owner_id uuid:=auth.uid();
 table_names text[]:=public.library_backup_tables();
 table_rows json[]:='{}';
 t text; predicate text; projection text; rows json; work_ids uuid[];
 backup_version integer;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select array_agg(work_id) into work_ids from (
  select work_id from public.library_entries where user_id=owner_id
  union select work_id from public.metadata_jobs where user_id=owner_id
 ) saved;

 foreach t in array table_names loop
  predicate:=case t
   when 'works' then 'r.id=any($2)'
   when 'work_authors' then 'r.work_id=any($2)'
   when 'work_fandoms' then 'r.work_id=any($2)'
   when 'work_tags' then 'r.work_id=any($2)'
   when 'authors' then 'r.id in (select l.author_id from public.work_authors l where l.work_id=any($2))'
   when 'fandoms' then 'r.id in (select l.fandom_id from public.work_fandoms l where l.work_id=any($2))'
   when 'tags' then 'r.id in (select l.tag_id from public.work_tags l where l.work_id=any($2))'
   else 'r.user_id=$1' end;
  projection:=case t
   when 'library_entries' then $row$case when r.crosspost_group_id is null
    then to_jsonb(r)-array['crosspost_group_id','crosspost_order'] else to_jsonb(r) end$row$
   when 'metadata_jobs' then $row$to_jsonb(r)||'{"lease_token":null,"lease_until":null}'::jsonb$row$
   when 'import_batches' then $row$case when not r.site_import then to_jsonb(r)-'site_import' else to_jsonb(r) end$row$
   when 'import_items' then $row$case when r.source_url is null
    then to_jsonb(r)-array['source_url','site_recognized','site_attempts','site_lease','site_lease_until']
    else to_jsonb(r)-array['site_lease','site_lease_until'] end$row$
   else 'r' end;
  execute format('select coalesce(json_agg(%s),''[]''::json) from public.%I r where %s',projection,t,predicate)
   into rows using owner_id,work_ids;
  table_rows:=array_append(table_rows,rows);
 end loop;

 select case when bool_or(crosspost_group_id is not null) then 3
  when bool_or(source_url is not null) then 2 else 1 end into backup_version
 from public.library_entries where user_id=owner_id;
 if backup_version=3 then
  table_names:=table_names||array['crosspost_chapter_groups','crosspost_story_states'];
  table_rows:=table_rows||array[
   coalesce((select json_agg(g order by g.id) from public.crosspost_chapter_groups g where g.user_id=owner_id),'[]'::json),
   coalesce((select json_agg(s order by s.group_id) from public.crosspost_story_states s where s.user_id=owner_id),'[]'::json)];
 end if;
 select json_agg(g order by g.group_id) into rows from public.crosspost_organization g where g.user_id=owner_id;
 if rows is not null then
  table_names:=array_append(table_names,'crosspost_organization');
  table_rows:=array_append(table_rows,rows);
 end if;

 return json_build_object('format','between-chapters-backup','version',backup_version,'exported_at',now(),
  'user_id',owner_id,'tables',(select json_object_agg(name,data) from unnest(table_names,table_rows) as snapshot(name,data)))::jsonb;
end;
$$;

commit;
