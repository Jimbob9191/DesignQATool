import { sql } from "drizzle-orm";
import { boolean, pgPolicy, pgTable, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

// One row per user, created lazily on first preference read/write (see
// src/lib/notifications/preferences.ts) rather than at signup — most users
// never touch this, so there's no dedicated signup trigger for it.
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    notifyOnMention: boolean("notify_on_mention").notNull().default(true),
    notifyOnReply: boolean("notify_on_reply").notNull().default(true),
  },
  (table) => [
    pgPolicy("user_preferences_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("user_preferences_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("user_preferences_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
  ]
).enableRLS();
