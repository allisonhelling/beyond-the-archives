begin;

-- Private series snapshots never create library works. Notes belong to the
-- reader and are kept separately from refreshable AO3 metadata.
create table public.library_series (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 ao3_series_id bigint not null check (ao3_series_id between 1 and 9007199254740991),
 metadata jsonb not null check (jsonb_typeof(metadata)='object'),
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,ao3_series_id)
);
alter table public.library_series enable row level security;
alter table public.library_series force row level security;
create policy own_series on public.library_series for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,delete on public.library_series to authenticated;
create trigger set_updated_at before update on public.library_series for each row execute function public.set_updated_at();

create function public.remember_library_series(p_metadata jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid bigint; result uuid; work jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>900000
  or jsonb_typeof(p_metadata->'seriesId') is distinct from 'number'
  or (p_metadata->>'seriesId') !~ '^[1-9][0-9]{0,15}$'
  or jsonb_typeof(p_metadata->'title') is distinct from 'string' or length(trim(p_metadata->>'title'))=0
  or jsonb_typeof(p_metadata->'works') is distinct from 'array' then raise exception 'Invalid series snapshot' using errcode='22023'; end if;
 sid:=(p_metadata->>'seriesId')::bigint;
 if sid>9007199254740991 or p_metadata->>'normalizedUrl' is distinct from 'https://archiveofourown.org/series/' || sid::text
  or jsonb_array_length(p_metadata->'works')>2000 then raise exception 'Invalid series snapshot' using errcode='22023'; end if;
 for work in select value from jsonb_array_elements(p_metadata->'works') loop
  if jsonb_typeof(work) is distinct from 'object'
   or jsonb_typeof(work->'workId') is distinct from 'number'
   or (work->>'workId') !~ '^[1-9][0-9]{0,15}$' then raise exception 'Invalid series work' using errcode='22023'; end if;
  if (work->>'workId')::bigint>9007199254740991
   or work->>'url' is distinct from 'https://archiveofourown.org/works/' || (work->>'workId') then raise exception 'Invalid series work' using errcode='22023'; end if;
 end loop;
 insert into public.library_series(user_id,ao3_series_id,metadata) values(auth.uid(),sid,p_metadata)
 on conflict(user_id,ao3_series_id) do update set metadata=excluded.metadata returning id into result;
 return result;
end;
$$;
revoke all on function public.remember_library_series(jsonb) from public,anon;
grant execute on function public.remember_library_series(jsonb) to authenticated;

create function public.save_library_series_note(p_series bigint,p_notes text,p_base text) returns void
language plpgsql security definer set search_path='' as $$
declare saved text; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select notes into saved from public.library_series where user_id=auth.uid() and ao3_series_id=p_series for update;
 if not found then raise exception 'Load the series details before adding a note' using errcode='22023'; end if;
 result:=public.merge_library_edits(jsonb_build_object('notes',p_base),jsonb_build_object('notes',coalesce(p_notes,'')),jsonb_build_object('notes',saved));
 if result->'conflicts'<>'[]'::jsonb then
  raise exception 'This series note changed on another device. Review both versions before saving.'
   using errcode='40001',detail=(result || jsonb_build_object('base',jsonb_build_object('notes',saved)))::text;
 end if;
 update public.library_series set notes=result->'merged'->>'notes' where user_id=auth.uid() and ao3_series_id=p_series;
end;
$$;
revoke all on function public.save_library_series_note(bigint,text,text) from public,anon;
grant execute on function public.save_library_series_note(bigint,text,text) to authenticated;
commit;
