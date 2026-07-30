CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "invitations_select_owner_admin" ON "invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_team_role("invitations"."team_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "invitations_insert_owner_admin" ON "invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_team_role("invitations"."team_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "invitations_delete_owner_admin" ON "invitations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_team_role("invitations"."team_id") in ('owner', 'admin'));