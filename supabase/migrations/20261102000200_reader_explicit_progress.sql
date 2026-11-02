begin;
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.reader_offline_snapshot()'::regprocedure) into definition;
 updated:=replace(definition,
 $old$'completedCount',case when jsonb_typeof(c.value)='array' then jsonb_array_length(c.value) else 0 end$old$,
 $new$'completedCount',case when jsonb_typeof(p.value)='number' then p.value else to_jsonb(case when jsonb_typeof(c.value)='array' then jsonb_array_length(c.value) else 0 end) end$new$);
 updated:=replace(updated,
 $old$ left join public.reader_cloud_values c on$old$,
 $new$ left join public.reader_cloud_values p on p.user_id=m.user_id and p.key=split_part(m.key,'/',1)||'/progress'
 left join public.reader_cloud_values c on$new$);
 if updated=definition or position('p.value' in updated)=0 then raise exception 'Review reader hub progress query'; end if;
 execute updated;
end $migration$;
commit;
