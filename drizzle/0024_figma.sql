CREATE TYPE "public"."figma_auth_type" AS ENUM('pat', 'oauth');--> statement-breakpoint
CREATE TABLE "figma_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auth_type" "figma_auth_type" NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"figma_user_id" text NOT NULL,
	"figma_handle" text NOT NULL,
	"figma_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figma_connections_oauth_refresh" CHECK ("figma_connections"."auth_type" = 'pat' or "figma_connections"."refresh_token_enc" is not null)
);
--> statement-breakpoint
ALTER TABLE "figma_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "figma_file_key" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "figma_node_id" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "figma_version" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "figma_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_figma_source" CHECK (("assets"."figma_file_key" is null) = ("assets"."figma_node_id" is null));