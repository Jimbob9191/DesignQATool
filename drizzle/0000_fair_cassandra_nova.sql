CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "teams_select_member" ON "teams" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from team_members where team_members.team_id = "teams"."id" and team_members.user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "teams_insert_authenticated" ON "teams" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "teams_update_owner_admin" ON "teams" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from team_members where team_members.team_id = "teams"."id" and team_members.user_id = auth.uid() and team_members.role in ('owner', 'admin')));--> statement-breakpoint
CREATE POLICY "teams_delete_owner" ON "teams" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from team_members where team_members.team_id = "teams"."id" and team_members.user_id = auth.uid() and team_members.role = 'owner'));--> statement-breakpoint
CREATE POLICY "team_members_select_same_team" ON "team_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from team_members tm where tm.team_id = "team_members"."team_id" and tm.user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "team_members_insert_bootstrap_or_admin" ON "team_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((
        "team_members"."user_id" = auth.uid()
        and not exists (select 1 from team_members tm where tm.team_id = "team_members"."team_id")
      ) or exists (
        select 1 from team_members tm
        where tm.team_id = "team_members"."team_id" and tm.user_id = auth.uid() and tm.role in ('owner', 'admin')
      ));--> statement-breakpoint
CREATE POLICY "team_members_update_owner_admin" ON "team_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from team_members tm where tm.team_id = "team_members"."team_id" and tm.user_id = auth.uid() and tm.role in ('owner', 'admin')));--> statement-breakpoint
CREATE POLICY "team_members_delete_owner_admin_or_self" ON "team_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("team_members"."user_id" = auth.uid() or exists (
        select 1 from team_members tm
        where tm.team_id = "team_members"."team_id" and tm.user_id = auth.uid() and tm.role in ('owner', 'admin')
      ));