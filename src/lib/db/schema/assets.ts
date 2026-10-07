import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { pages } from "./pages";
import { teams } from "./teams";

export const assetKindEnum = pgEnum("asset_kind", ["design", "capture"]);

// storage_path convention: `${teamId}/${assetId}.${ext}` in the private
// "assets" bucket — see drizzle/0007_asset_storage_bucket.sql for the bucket
// and its storage.objects RLS policies, which check the same team_id prefix.
function storagePathInTeam(table: { teamId: AnyPgColumn; storagePath: AnyPgColumn }) {
  return sql`split_part(${table.storagePath}, '/', 1) = ${table.teamId}::text
        and ${table.storagePath} not like '%..%'`;
}

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
    // What people call the file: the original upload's filename, renamable.
    // Null for rows from before names were kept, and for captures — show
    // those with assetDisplayName(), which falls back to the storage basename.
    name: text("name"),
    width: integer("width"),
    height: integer("height"),
    mime: text("mime").notNull(),
    // Nullable and set null on delete so removing a user leaves the team's
    // shared work in place, attributed to "Former member".
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("assets_team_id_created_at_idx").on(table.teamId, table.createdAt),
    index("assets_page_id_created_at_idx").on(table.pageId, table.createdAt),
    // Mirrors assetNameSchema, since RLS lets members update rows directly.
    check(
      "assets_name_length",
      sql`${table.name} is null or char_length(btrim(${table.name})) between 1 and 255`
    ),
    pgPolicy("assets_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) is not null`,
    }),
    // The server signs Storage URLs for whatever storage_path a row names,
    // using the RLS-bypassing service_role client — so the path must be
    // pinned to the row's own team folder, or a row could point at another
    // team's object and get it signed.
    pgPolicy("assets_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')
        and ${storagePathInTeam(table)}
        and ${table.createdBy} = auth.uid()`,
    }),
    pgPolicy("assets_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')
        and ${storagePathInTeam(table)}`,
    }),
    pgPolicy("assets_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
  ]
).enableRLS();
