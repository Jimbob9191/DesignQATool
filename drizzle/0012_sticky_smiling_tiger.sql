CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annotation_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_annotation_id_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "comments_select_team_member" ON "comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = "comments"."annotation_id" and public.current_team_role(projects.team_id) is not null
      ));--> statement-breakpoint
CREATE POLICY "comments_insert_non_viewer" ON "comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = "comments"."annotation_id" and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      ));--> statement-breakpoint
CREATE POLICY "comments_update_own" ON "comments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("comments"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "comments_delete_own" ON "comments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("comments"."created_by" = auth.uid());