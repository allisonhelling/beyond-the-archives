begin;
-- Retain the same owner-scoped collection definitions for disconnected browsing.
do $$ declare definition text; updated text; begin
 select pg_get_functiondef('public.reader_offline_snapshot()'::regprocedure) into definition;
 updated:=replace(definition,
  $old$return jsonb_build_object('readers',$old$,
  $new$return jsonb_build_object('collections',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_position,c.id) from public.collections c where c.user_id=v_owner_id),'[]'::jsonb),'readers',$new$);
 if updated=definition then raise exception 'Review offline collection projection'; end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
commit;
