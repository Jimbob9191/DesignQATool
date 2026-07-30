import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { assets } from "./assets";

export const captureStatusEnum = pgEnum("capture_status", ["pending", "ready", "error"]);

// One row per capture attempt — re-capturing a page never overwrites a
// previous row, so capture history is preserved (see Phase 6 pin
// re-resolution, which needs the old element maps around).
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    viewportWidth: integer("viewport_width").notNull(),
    deviceScaleFactor: integer("device_scale_factor").notNull().default(1),
    elementMap: jsonb("element_map"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    status: captureStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("captures_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from assets
        where assets.id = ${table.assetId} and public.current_team_role(assets.team_id) is not null
      )`,
    }),
    pgPolicy("captures_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (
        select 1 from assets
        where assets.id = ${table.assetId} and public.current_team_role(assets.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("captures_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from assets
        where assets.id = ${table.assetId} and public.current_team_role(assets.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
  ]
).enableRLS();
