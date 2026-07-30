-- Custom SQL migration file, put your code below! --

-- On signup, give every new user a personal team they own.
-- Runs as SECURITY DEFINER so it can write to public.teams / public.team_members
-- despite RLS, and is triggered directly off auth.users (owned by Supabase).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
  base_slug text;
  final_slug text;
begin
  base_slug := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'user'), '[^a-z0-9]+', '-', 'gi'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'user';
  end if;
  final_slug := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.teams (name, slug)
  values (coalesce(split_part(new.email, '@', 1), 'Personal') || '''s Team', final_slug)
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
