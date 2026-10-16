-- Replace only the scalar metadata update block in the existing commit boundary.
-- Static columns allow PostgreSQL's function linter to validate the update correctly.
begin;
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)'::regprocedure) into definition;
 updated:=replace(definition,$old$  foreach k in array array['title','summary','rating','word_count','is_complete','ao3_published_at','ao3_updated_at'] loop
   v_value:=p_metadata->k;
   if v_value is null or v_value='null'::jsonb then continue; end if;
   if k in ('title','summary','rating') then execute format('update public.works set %I=$1 where id=$2',k) using p_metadata->>k,j.work_id;
   elsif k in ('word_count','published_chapters','total_chapters') then execute format('update public.works set %I=$1 where id=$2',k) using (p_metadata->>k)::integer,j.work_id;
   elsif k='is_complete' then update public.works set is_complete=(p_metadata->>k)::boolean where id=j.work_id;
   else execute format('update public.works set %I=$1 where id=$2',k) using (p_metadata->>k)::timestamptz,j.work_id; end if;
  end loop;
$old$,$new$  update public.works set
   title=coalesce(p_metadata->>'title',title),
   summary=coalesce(p_metadata->>'summary',summary),
   rating=coalesce(p_metadata->>'rating',rating),
   word_count=coalesce((p_metadata->>'word_count')::integer,word_count),
   is_complete=coalesce((p_metadata->>'is_complete')::boolean,is_complete),
   ao3_published_at=coalesce((p_metadata->>'ao3_published_at')::timestamptz,ao3_published_at),
   ao3_updated_at=coalesce((p_metadata->>'ao3_updated_at')::timestamptz,ao3_updated_at)
  where id=j.work_id;
$new$);
 if updated=definition then raise exception 'Metadata update block changed; review migration'; end if;
 updated:=replace(updated,'k text; v_value jsonb;','k text;');
 execute updated;
end $migration$;
commit;
