-- The delivery handler verifies Reader access before accepting a paired upload.
grant select (user_id) on public.reader_app_access to service_role;
