begin;
-- Null preserves the existing account choice until a mobile override is saved.
alter table public.metadata_preferences add column retrieval_mode_mobile text
 check (retrieval_mode_mobile in ('direct','extension'));

create or replace function public.set_metadata_job_mode() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 client_info text := coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','');
begin
 select case when client_info like '%ao3-library/mobile%' then coalesce(retrieval_mode_mobile,retrieval_mode) else retrieval_mode end
 into new.retrieval_mode from public.metadata_preferences where user_id=new.user_id;
 new.retrieval_mode:=coalesce(new.retrieval_mode,'direct');
 if new.retrieval_mode='extension' then new.error_message:='Waiting for the browser extension. Connect it in Settings; finish any AO3 confirmation in the opened tab.'; end if;
 return new;
end $$;
revoke all on function public.set_metadata_job_mode() from public,anon,authenticated;
commit;
