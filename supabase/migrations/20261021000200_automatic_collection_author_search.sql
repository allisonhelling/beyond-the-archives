begin;

-- Automatic collection queries search authors; the shared library filters and
-- within-results search retain their existing behavior.
create or replace function public.automatic_collection_ids(s jsonb,p_owner uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.collections c
 where c.user_id=p_owner and c.default_key is null and c.automatic_rules is not null
 and (coalesce(c.automatic_rules->'filters'->>'query','')='' or
  strpos(public.library_normalize(public.library_text(coalesce(s->'metadata'->'authors','[]'))),
   public.library_normalize(trim(c.automatic_rules->'filters'->>'query')))>0)
 and public.library_filter(s,(c.automatic_rules->'filters')-'query',c.automatic_rules->'terms');
$$;

commit;
