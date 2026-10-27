-- Reuse the companion's existing authenticated, atomic merge/save boundary.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) into definition;
 updated:=replace(definition, $old$public.library_edit_snapshot(entry.id)-'metadata'-'favorite'$old$, $new$public.library_edit_snapshot(entry.id)-'metadata'$new$);
 updated:=replace(updated, $old$coalesce(entry.is_favorite,false),$old$, $new$coalesce((p_input->>'favorite')::boolean,entry.is_favorite,false),$new$);
 updated:=replace(updated, $old$  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  select * into entry$old$, $new$  if p_action='save' and p_input ? 'rec' then
   if jsonb_typeof(p_input->'rec') is distinct from 'boolean' then raise exception 'Invalid Rec status' using errcode='22023'; end if;
   update public.library_entries set is_rec=(p_input->>'rec')::boolean where id=entry_id and user_id=device.user_id;
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  select * into entry$new$);
 updated:=replace(updated, $old$'rating',entry.personal_rating,$old$, $new$'rating',entry.personal_rating,'favorite',entry.is_favorite,'rec',entry.is_rec,$new$);
 if updated=definition or updated not like '%''favorite'',entry.is_favorite%' or updated not like '%set is_rec=(p_input->>''rec'')::boolean%' then raise exception 'Review companion personal flag save boundary'; end if;
 execute updated;
end;
$migration$;
