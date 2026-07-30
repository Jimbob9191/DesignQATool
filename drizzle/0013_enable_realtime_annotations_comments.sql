-- Custom SQL migration file, put your code below! --

-- Supabase Realtime only broadcasts postgres_changes for tables added to
-- this publication. RLS still applies on top — a connected client only
-- receives change events for rows it's allowed to SELECT.
alter publication supabase_realtime add table annotations;
alter publication supabase_realtime add table comments;
