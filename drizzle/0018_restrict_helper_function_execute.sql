-- Custom SQL migration file, put your code below! --
-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase exposes
-- public-schema functions over its RPC API — so anyone with the anon key
-- could call these SECURITY DEFINER helpers directly. team_member_count()
-- in particular answers "how many members does team X have?" for any team.
-- Only RLS policies (evaluated as the authenticated role) need them.
revoke execute on function public.current_team_role(uuid) from public, anon;
revoke execute on function public.team_member_count(uuid) from public, anon;
grant execute on function public.current_team_role(uuid) to authenticated, service_role;
grant execute on function public.team_member_count(uuid) to authenticated, service_role;
