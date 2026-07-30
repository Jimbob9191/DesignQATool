CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notify_on_mention" boolean DEFAULT true NOT NULL,
	"notify_on_reply" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_preferences_select_own" ON "user_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_preferences"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_preferences_insert_own" ON "user_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_preferences"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_preferences_update_own" ON "user_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_preferences"."user_id" = auth.uid());