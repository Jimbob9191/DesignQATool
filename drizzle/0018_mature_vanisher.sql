ALTER TABLE "assets" DROP CONSTRAINT "assets_page_id_pages_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_page_id_project_id_pages_fk" FOREIGN KEY ("page_id","project_id") REFERENCES "public"."pages"("id","project_id") ON DELETE SET NULL ("page_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_page_requires_project" CHECK ("assets"."page_id" is null or "assets"."project_id" is not null);--> statement-breakpoint
ALTER POLICY "assets_insert_non_viewer" ON "assets" TO authenticated WITH CHECK (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')
        and ("assets"."project_id" is null or exists (
          select 1 from projects
          where projects.id = "assets"."project_id" and projects.team_id = assets.team_id
        )));--> statement-breakpoint
ALTER POLICY "assets_update_non_viewer" ON "assets" TO authenticated USING (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')) WITH CHECK (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')
        and ("assets"."project_id" is null or exists (
          select 1 from projects
          where projects.id = "assets"."project_id" and projects.team_id = assets.team_id
        )));