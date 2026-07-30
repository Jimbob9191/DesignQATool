-- Custom SQL migration file, put your code below! --

-- RLS policies only filter which rows are visible/writable; the underlying
-- Postgres GRANT system decides whether the "authenticated" role can attempt
-- the operation at all. Tables created through a raw migration tool (as
-- opposed to the Supabase dashboard) don't get these grants automatically.
grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Apply the same grants to tables created by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
