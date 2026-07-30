ALTER POLICY "teams_select_member" ON "teams" TO authenticated USING (public.current_team_role("teams"."id") is not null);--> statement-breakpoint
ALTER POLICY "teams_update_owner_admin" ON "teams" TO authenticated USING (public.current_team_role("teams"."id") in ('owner', 'admin'));--> statement-breakpoint
ALTER POLICY "teams_delete_owner" ON "teams" TO authenticated USING (public.current_team_role("teams"."id") = 'owner');--> statement-breakpoint
ALTER POLICY "team_members_select_same_team" ON "team_members" TO authenticated USING (public.current_team_role("team_members"."team_id") is not null);--> statement-breakpoint
ALTER POLICY "team_members_insert_bootstrap_or_admin" ON "team_members" TO authenticated WITH CHECK ((
        "team_members"."user_id" = auth.uid()
        and public.team_member_count("team_members"."team_id") = 0
      ) or public.current_team_role("team_members"."team_id") in ('owner', 'admin'));--> statement-breakpoint
ALTER POLICY "team_members_update_owner_admin" ON "team_members" TO authenticated USING (public.current_team_role("team_members"."team_id") in ('owner', 'admin'));--> statement-breakpoint
ALTER POLICY "team_members_delete_owner_admin_or_self" ON "team_members" TO authenticated USING ("team_members"."user_id" = auth.uid() or public.current_team_role("team_members"."team_id") in ('owner', 'admin'));