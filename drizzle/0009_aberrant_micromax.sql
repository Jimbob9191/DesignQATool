CREATE TYPE "public"."capture_status" AS ENUM('pending', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"url" text NOT NULL,
	"viewport_width" integer NOT NULL,
	"device_scale_factor" integer DEFAULT 1 NOT NULL,
	"element_map" jsonb,
	"captured_at" timestamp with time zone,
	"status" "capture_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "captures_select_team_member" ON "captures" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from assets
        where assets.id = "captures"."asset_id" and public.current_team_role(assets.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "captures_insert_non_viewer" ON "captures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from assets
        where assets.id = "captures"."asset_id" and public.current_team_role(assets.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "captures_update_non_viewer" ON "captures" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (
        select 1 from assets
        where assets.id = "captures"."asset_id" and public.current_team_role(assets.team_id) in ('owner', 'admin', 'member')
      ));