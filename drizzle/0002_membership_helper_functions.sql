-- Custom SQL migration file, put your code below! --

-- SECURITY DEFINER helpers for team_members RLS. A policy on team_members
-- cannot subquery team_members itself (causes "infinite recursion detected
-- in policy") since evaluating the subquery re-triggers team_members' own
-- RLS. These functions run as their owner (the migration role, which owns
-- the tables and so bypasses RLS), breaking the cycle.
create or replace function public.current_team_role(target_team_id uuid)
returns team_role
language sql
security definer
stable
set search_path = public
as $$
  select role from team_members
  where team_id = target_team_id and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.team_member_count(target_team_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from team_members where team_id = target_team_id;
$$;
