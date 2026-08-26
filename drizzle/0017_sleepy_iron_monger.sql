ALTER TABLE "pages" ADD CONSTRAINT "pages_id_project_id_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "assets" SET "project_id" = "pages"."project_id" FROM "pages" WHERE "assets"."page_id" = "pages"."id";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_id_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_page_id_project_id_idx" ON "assets" USING btree ("page_id","project_id");
