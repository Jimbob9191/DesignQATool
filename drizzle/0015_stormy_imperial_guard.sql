CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_id" uuid NOT NULL,
	"token" text NOT NULL,
	"allow_anonymous_comments" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_comparison_id_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "share_links_select_team_member" ON "share_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "share_links"."comparison_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "share_links_insert_non_viewer" ON "share_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "share_links"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "share_links_delete_non_viewer" ON "share_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = "share_links"."comparison_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));