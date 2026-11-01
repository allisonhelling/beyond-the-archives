-- Match the schema-wide forced-RLS contract. Username access remains confined
-- to the existing security-definer functions owned by the trusted migration role.
alter table public.account_usernames force row level security;
