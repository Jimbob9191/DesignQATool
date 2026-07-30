CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"design_asset_id" uuid NOT NULL,
	"capture_asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comparisons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_design_asset_id_assets_id_fk" FOREIGN KEY ("design_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_capture_asset_id_assets_id_fk" FOREIGN KEY ("capture_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "comparisons_select_team_member" ON "comparisons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = "comparisons"."page_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "comparisons_insert_non_viewer" ON "comparisons" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = "comparisons"."page_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "comparisons_delete_non_viewer" ON "comparisons" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = "comparisons"."page_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));