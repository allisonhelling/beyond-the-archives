begin;

-- Match the browser's seeded 32-bit hash so saved links and page boundaries
-- retain the same shuffle across sample and connected libraries.
create function public.library_shuffle_key(id text, seed text) returns bigint
language plpgsql immutable strict set search_path='' as $$
declare h bigint := 2166136261; input text := seed||':'||id; i integer;
begin
 for i in 1..char_length(input) loop
  h := ((h # ascii(substr(input,i,1))) * 16777619) % 4294967296;
 end loop;
 h := ((h # (h >> 16)) * 65599) % 4294967296;
 return h # (h >> 16);
end;
$$;
revoke all on function public.library_shuffle_key(text,text) from public,anon;
grant execute on function public.library_shuffle_key(text,text) to authenticated;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) into definition;
 updated := replace(definition,'row_number() over(order by',
 $new$row_number() over(order by
 case when p_query->'filters'->>'sort'='random' then public.library_shuffle_key(s->>'id',coalesce(p_query->'filters'->>'randomSeed','')) end,
 case when p_query->'filters'->>'sort'='random' then s->>'id' end collate "C",$new$);
 if updated=definition then raise exception 'Review random library ordering'; end if;
 execute updated;
end;
$migration$;

commit;
