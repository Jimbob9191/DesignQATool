CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_team_id_slug_unique" ON "projects" USING btree ("team_id","slug");--> statement-breakpoint
CREATE POLICY "projects_select_team_member" ON "projects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_team_role("projects"."team_id") is not null);--> statement-breakpoint
CREATE POLICY "projects_insert_non_viewer" ON "projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_team_role("projects"."team_id") in ('owner', 'admin', 'member'));--> statement-breakpoint
CREATE POLICY "projects_update_non_viewer" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_team_role("projects"."team_id") in ('owner', 'admin', 'member'));--> statement-breakpoint
CREATE POLICY "projects_delete_owner_admin" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_team_role("projects"."team_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "pages_select_team_member" ON "pages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from projects
        where projects.id = "pages"."project_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "pages_insert_non_viewer" ON "pages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from projects
        where projects.id = "pages"."project_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "pages_update_non_viewer" ON "pages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (
        select 1 from projects
        where projects.id = "pages"."project_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "pages_delete_non_viewer" ON "pages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (
        select 1 from projects
        where projects.id = "pages"."project_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));