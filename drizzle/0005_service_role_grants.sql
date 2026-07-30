-- Custom SQL migration file, put your code below! --

-- service_role bypasses RLS by role attribute, but (like authenticated)
-- still needs base Postgres GRANTs to touch tables created outside
-- Supabase's own bootstrap SQL.
grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
