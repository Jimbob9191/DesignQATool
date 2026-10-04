ALTER TABLE "comparisons" ALTER COLUMN "capture_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "live_url" text;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "viewport_width" integer;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "element_text" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "page_url" text;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_capture_or_live" CHECK ("comparisons"."capture_asset_id" is not null or ("comparisons"."live_url" is not null and "comparisons"."viewport_width" is not null));--> statement-breakpoint
ALTER POLICY "comparisons_insert_non_viewer" ON "comparisons" TO authenticated WITH CHECK ("comparisons"."created_by" = auth.uid() and exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = "comparisons"."page_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and exists (select 1 from assets where assets.id = "comparisons"."design_asset_id" and assets.team_id = projects.team_id)
          and ("comparisons"."capture_asset_id" is null
            or exists (select 1 from assets where assets.id = "comparisons"."capture_asset_id" and assets.team_id = projects.team_id))
      ));--> statement-breakpoint
ALTER POLICY "annotations_insert_non_viewer" ON "annotations" TO authenticated WITH CHECK ("annotations"."created_by" = auth.uid() and exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and ("annotations"."asset_id" is null
            or exists (select 1 from assets where assets.id = "annotations"."asset_id" and assets.team_id = projects.team_id))
      ));--> statement-breakpoint
ALTER POLICY "annotations_update_non_viewer" ON "annotations" TO authenticated USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )) WITH CHECK (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and ("annotations"."asset_id" is null
            or exists (select 1 from assets where assets.id = "annotations"."asset_id" and assets.team_id = projects.team_id))
      ));