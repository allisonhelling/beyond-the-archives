begin;
-- Extend the existing owner-scoped availability projection with member identities.
-- Only active, uploaded cloud originals qualify, as in the original snapshot.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.reader_offline_snapshot()'::regprocedure) into definition;
 updated:=replace(definition,
 $old$'workId',m.value->>'workId','metadata',m.value->'metadata',$old$,
 $new$'workId',case when jsonb_typeof(m.value->'works')='array' then case when jsonb_array_length(m.value->'works')>1 then null else m.value->>'workId' end else m.value->>'workId' end,
  'workCount',case when jsonb_typeof(m.value->'works')='array' then jsonb_array_length(m.value->'works') else 1 end,
  'workIds',coalesce((select jsonb_agg(distinct member->>'workId') from jsonb_array_elements(case when jsonb_typeof(m.value->'works')='array' then m.value->'works' else '[]'::jsonb end) member where member->>'workId' ~ '^[1-9][0-9]{0,15}$'),'[]'::jsonb),
  'metadata',m.value->'metadata',$new$);
 updated:=replace(updated,
 $old$b->>'workId'=w.ao3_work_id::text$old$,
 $new$(b->>'workId'=w.ao3_work_id::text or b->'workIds' ? w.ao3_work_id::text)$new$);
 if updated=definition or position('''workIds''' in updated)=0 then raise exception 'Review anthology availability projection'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
