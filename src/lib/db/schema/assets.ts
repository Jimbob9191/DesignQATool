import { sql } from "drizzle-orm";
import { integer, pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { pages } from "./pages";
import { teams } from "./teams";

export const assetKindEnum = pgEnum("asset_kind", ["design", "capture"]);

// storage_path convention: `${teamId}/${assetId}.${ext}` in the private
// "assets" bucket — see drizzle/0007_asset_storage_bucket.sql for the bucket
// and its storage.objects RLS policies, which check the same team_id prefix.
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    kind: assetKindEnum("kind").notNull(),
    storagePath: text("storage_path").notNull(),
    width: integer("width"),
    height: integer("height"),
    mime: text("mime").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("assets_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) is not null`,
    }),
    pgPolicy("assets_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
    pgPolicy("assets_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
    pgPolicy("assets_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
  ]
).enableRLS();
