-- Postgres doesn't index foreign keys, so the per-page lookups, the RLS
-- helpers and cascading deletes were all scanning whole child tables.
-- Not CONCURRENTLY: drizzle-kit migrate runs every pending migration in one
-- transaction, which CONCURRENTLY refuses, and these tables are small enough
-- that the brief write lock is fine.
CREATE INDEX IF NOT EXISTS "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_team_id_created_at_idx" ON "invitations" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_project_id_idx" ON "pages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_team_id_created_at_idx" ON "assets" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_page_id_created_at_idx" ON "assets" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_asset_id_created_at_idx" ON "captures" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparisons_page_id_created_at_idx" ON "comparisons" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparisons_design_asset_id_idx" ON "comparisons" USING btree ("design_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparisons_capture_asset_id_idx" ON "comparisons" USING btree ("capture_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotations_comparison_id_created_at_idx" ON "annotations" USING btree ("comparison_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotations_asset_id_idx" ON "annotations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_annotation_id_created_at_idx" ON "comments" USING btree ("annotation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_comparison_id_created_at_idx" ON "share_links" USING btree ("comparison_id","created_at");