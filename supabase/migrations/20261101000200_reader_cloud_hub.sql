begin;
-- The hub includes cloud originals even before any installation downloads them.
create or replace function public.reader_offline_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner_id uuid:=auth.uid(); ids uuid[]; cloud_books jsonb;
begin
 if v_owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',split_part(m.key,'/',1),'workId',m.value->>'workId','metadata',m.value->'metadata',
  'createdAt',m.value->>'importedAt','updatedAt',m.value->>'metadataAt',
  'status',coalesce(s.value,'"to_read"'::jsonb),'notes',coalesce(n.value,'""'::jsonb),
  'completedCount',case when jsonb_typeof(c.value)='array' then jsonb_array_length(c.value) else 0 end
 ) order by m.key),'[]'::jsonb) into cloud_books
 from public.reader_cloud_values m
 left join public.reader_cloud_values d on d.user_id=m.user_id and d.key=split_part(m.key,'/',1)||'/deleted'
 left join public.reader_cloud_values a on a.user_id=m.user_id and a.key=split_part(m.key,'/',1)||'/active'
 left join public.reader_cloud_values s on s.user_id=m.user_id and s.key=split_part(m.key,'/',1)||'/status'
 left join public.reader_cloud_values n on n.user_id=m.user_id and n.key=split_part(m.key,'/',1)||'/notes'
 left join public.reader_cloud_values c on c.user_id=m.user_id and c.key=split_part(m.key,'/',1)||'/completed'
 where m.user_id=v_owner_id and m.key ~ '^[a-f0-9]{64}/manifest$'
  and jsonb_typeof(m.value->'metadata')='object'
  and d.value is distinct from 'true'::jsonb and coalesce(a.value,m.value->'active','true'::jsonb)='true'::jsonb
  and exists(select 1 from public.reader_organizer_links l where l.user_id=v_owner_id)
  and exists(select 1 from storage.objects o where o.bucket_id='reader-epubs' and o.name=v_owner_id::text||'/'||split_part(m.key,'/',1)||'.epub');
 select array_agg(e.id) into ids from public.library_entries e join public.works w on w.id=e.work_id
 where e.user_id=v_owner_id and (
  exists(select 1 from public.reader_availability r where r.user_id=v_owner_id and r.works ? w.ao3_work_id::text)
  or exists(select 1 from jsonb_array_elements(cloud_books) b where b->>'workId'=w.ao3_work_id::text));
 return jsonb_build_object('readers',coalesce((select jsonb_agg(jsonb_build_object('id',installation_id,'name',name,'url',url,'reportedAt',reported_at,'works',works) order by name,device_id) from public.reader_availability where user_id=v_owner_id),'[]'::jsonb),
 'stories',public.library_story_details(coalesce(ids,'{}'::uuid[])),'cloudBooks',cloud_books);
end $$;

-- Revoke reporting reader credentials as well as registered account devices.
-- Other browser companions and all cloud books/reading data remain intact.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.reader_organizer_connection(text,uuid,text)'::regprocedure) into definition;
 updated:=replace(definition,$old$ elsif p_action='disable' then$old$,$new$ elsif p_action='disable' then
  delete from public.userscript_devices where user_id=owner_id and id in(select r.device_id from public.reader_availability r where r.user_id=owner_id);
$new$);
 if updated=definition then raise exception 'Review reader disconnect dispatch'; end if;
 execute updated;
end $migration$;
commit;
