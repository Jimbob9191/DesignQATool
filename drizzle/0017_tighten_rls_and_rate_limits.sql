CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER POLICY "team_members_insert_bootstrap_or_admin" ON "team_members" TO authenticated WITH CHECK ((
        "team_members"."user_id" = auth.uid()
        and public.team_member_count("team_members"."team_id") = 0
      ) or (
        public.current_team_role("team_members"."team_id") = 'owner'
        or (public.current_team_role("team_members"."team_id") = 'admin' and "team_members"."role" <> 'owner')
      ));--> statement-breakpoint
ALTER POLICY "team_members_update_owner_admin" ON "team_members" TO authenticated USING ((
        public.current_team_role("team_members"."team_id") = 'owner'
        or (public.current_team_role("team_members"."team_id") = 'admin' and "team_members"."role" <> 'owner')
      )) WITH CHECK ((
        public.current_team_role("team_members"."team_id") = 'owner'
        or (public.current_team_role("team_members"."team_id") = 'admin' and "team_members"."role" <> 'owner')
      ));--> statement-breakpoint
ALTER POLICY "team_members_delete_owner_admin_or_self" ON "team_members" TO authenticated USING (("team_members"."user_id" = auth.uid() and "team_members"."role" <> 'owner') or (
        public.current_team_role("team_members"."team_id") = 'owner'
        or (public.current_team_role("team_members"."team_id") = 'admin' and "team_members"."role" <> 'owner')
      ));--> statement-breakpoint
ALTER POLICY "invitations_insert_owner_admin" ON "invitations" TO authenticated WITH CHECK (public.current_team_role("invitations"."team_id") in ('owner', 'admin')
        and "invitations"."role" <> 'owner'
        and "invitations"."invited_by" = auth.uid());--> statement-breakpoint
ALTER POLICY "assets_insert_non_viewer" ON "assets" TO authenticated WITH CHECK (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')
        and split_part("assets"."storage_path", '/', 1) = "assets"."team_id"::text
        and "assets"."storage_path" not like '%..%'
        and "assets"."created_by" = auth.uid());--> statement-breakpoint
ALTER POLICY "assets_update_non_viewer" ON "assets" TO authenticated USING (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')) WITH CHECK (public.current_team_role("assets"."team_id") in ('owner', 'admin', 'member')
        and split_part("assets"."storage_path", '/', 1) = "assets"."team_id"::text
        and "assets"."storage_path" not like '%..%');--> statement-breakpoint
ALTER POLICY "comparisons_insert_non_viewer" ON "comparisons" TO authenticated WITH CHECK ("comparisons"."created_by" = auth.uid() and exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = "comparisons"."page_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and exists (select 1 from assets where assets.id = "comparisons"."design_asset_id" and assets.team_id = projects.team_id)
          and exists (select 1 from assets where assets.id = "comparisons"."capture_asset_id" and assets.team_id = projects.team_id)
      ));--> statement-breakpoint
ALTER POLICY "annotations_insert_non_viewer" ON "annotations" TO authenticated WITH CHECK ("annotations"."created_by" = auth.uid() and exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "annotations"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and exists (select 1 from assets where assets.id = "annotations"."asset_id" and assets.team_id = projects.team_id)
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
          and exists (select 1 from assets where assets.id = "annotations"."asset_id" and assets.team_id = projects.team_id)
      ));--> statement-breakpoint
ALTER POLICY "comments_insert_non_viewer" ON "comments" TO authenticated WITH CHECK ("comments"."created_by" = auth.uid() and exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = "comments"."annotation_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
ALTER POLICY "comments_update_own" ON "comments" TO authenticated USING ("comments"."created_by" = auth.uid()) WITH CHECK ("comments"."created_by" = auth.uid() and exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = "comments"."annotation_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
ALTER POLICY "share_links_insert_non_viewer" ON "share_links" TO authenticated WITH CHECK ("share_links"."created_by" = auth.uid() and exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "share_links"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));