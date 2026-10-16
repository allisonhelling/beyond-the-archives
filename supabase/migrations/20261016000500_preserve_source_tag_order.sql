-- Tag identity is global; order belongs to a work's association with that tag.
-- Historical rows remain unknown until the next successful metadata refresh.
begin;
alter table public.work_tags add column source_position integer check(source_position>0);
create index work_tags_source_order_idx on public.work_tags(work_id,source_position,tag_id);
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,'v_name text;','v_name text; v_position integer;');
 updated:=replace(updated,
  $old$for v_name in select jsonb_array_elements_text(p_metadata->k) loop$old$,
  $new$for v_name, v_position in select value, ordinality::integer from jsonb_array_elements_text(p_metadata->k) with ordinality loop$new$);
 updated:=replace(updated,
  $old$insert into public.work_tags(work_id,tag_id) values(j.work_id,relation_id) on conflict do nothing;$old$,
  $new$insert into public.work_tags(work_id,tag_id,source_position) values(j.work_id,relation_id,v_position) on conflict do nothing;$new$);
 if updated=definition or position('with ordinality loop' in updated)=0 then raise exception 'Tag update block changed; review migration'; end if;
 execute updated;
end $migration$;
commit;
