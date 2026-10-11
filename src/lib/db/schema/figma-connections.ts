import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

export const figmaAuthTypeEnum = pgEnum("figma_auth_type", ["pat", "oauth"]);

// One Figma account per user, used to render the frames they import (see
// src/lib/figma/). Personal access tokens for now; `oauth` is reserved for a
// public OAuth app, which carries a refresh token and an expiry as well.
//
// Tokens are AES-GCM encrypted with FIGMA_TOKEN_KEY before they get here
// (src/lib/figma/crypto.ts). RLS is enabled with no policies on purpose: only
// the server's `db` client (which bypasses RLS) ever touches this table, so
// not even the token's owner can read it back through the Supabase API.
export const figmaConnections = pgTable(
  "figma_connections",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    authType: figmaAuthTypeEnum("auth_type").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    figmaUserId: text("figma_user_id").notNull(),
    figmaHandle: text("figma_handle").notNull(),
    figmaEmail: text("figma_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "figma_connections_oauth_refresh",
      sql`${table.authType} = 'pat' or ${table.refreshTokenEnc} is not null`
    ),
  ]
).enableRLS();
