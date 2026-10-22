begin;
alter table public.collections drop constraint collections_symbol_check;
alter table public.collections add constraint collections_symbol_check check (symbol in (
 'flask','moon','feather','leaf','flame','compass','anchor','cloud','music','key','sun','gem','flower','telescope',
 'book','reading','bookmark','heart','check','cross','library','sparkle','scroll'
));

-- Both live membership and conversion use the same author-only rule semantics.
create function public.automatic_collection_matches(s jsonb,p_rules jsonb) returns boolean
language sql stable set search_path='' as $$
 select (coalesce(p_rules->'filters'->>'query','')='' or
  strpos(public.library_normalize(public.library_text(coalesce(s->'metadata'->'authors','[]'))),
   public.library_normalize(trim(p_rules->'filters'->>'query')))>0)
 and public.library_filter(s,(p_rules->'filters')-'query',p_rules->'terms');
$$;
create or replace function public.automatic_collection_ids(s jsonb,p_owner uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.collections c
 where c.user_id=p_owner and c.default_key is null and c.automatic_rules is not null
 and public.automatic_collection_matches(s,c.automatic_rules);
$$;
revoke all on function public.automatic_collection_matches(jsonb,jsonb) from public,anon;
grant execute on function public.automatic_collection_matches(jsonb,jsonb) to authenticated;

-- Snapshot current automatic membership in the same transaction as removing rules.
-- Evaluate the old rules directly: the collection now has no automatic rules.
create or replace function public.clear_automatic_manual_memberships() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.automatic_rules is not null then
  delete from public.collection_works where collection_id=new.id and user_id=new.user_id;
  delete from public.collection_series where collection_id=new.id and user_id=new.user_id;
 elsif old.automatic_rules is not null then
  insert into public.collection_works(collection_id,library_entry_id,user_id)
  select new.id,d.id,new.user_id from public.library_search_documents d
  where d.user_id=new.user_id
   and public.automatic_collection_matches(d.story,old.automatic_rules)
  on conflict do nothing;
 end if;
 return new;
end;
$$;
commit;
