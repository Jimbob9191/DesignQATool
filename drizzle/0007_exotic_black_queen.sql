CREATE TYPE "public"."asset_kind" AS ENUM('design', 'capture');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"page_id" uuid,
	"kind" "asset_kind" NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"mime" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "assets_select_team_member" ON "assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_team_role("assets"."team_id") is not null);--> statement-breakpoint
CREATE POLICY "assets_insert_non_viewer" ON "assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member'));--> statement-breakpoint
CREATE POLICY "assets_update_non_viewer" ON "assets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member'));--> statement-breakpoint
CREATE POLICY "assets_delete_non_viewer" ON "assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member'));