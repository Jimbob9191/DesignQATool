CREATE TYPE "public"."annotation_status" AS ENUM('open', 'resolved', 'wont_fix', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."annotation_target" AS ENUM('design', 'live');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_id" uuid NOT NULL,
	"target" "annotation_target" NOT NULL,
	"asset_id" uuid NOT NULL,
	"x_ratio" numeric(12, 8) NOT NULL,
	"y_px" integer NOT NULL,
	"element_selector" text,
	"element_rect" jsonb,
	"status" "annotation_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_comparison_id_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "annotations_select_team_member" ON "annotations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "annotations_insert_non_viewer" ON "annotations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "annotations_update_non_viewer" ON "annotations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "annotations_delete_non_viewer" ON "annotations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));