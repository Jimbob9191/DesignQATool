import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { assets } from "./assets";
import { comparisons } from "./comparisons";

export const annotationTargetEnum = pgEnum("annotation_target", ["design", "live"]);
export const annotationStatusEnum = pgEnum("annotation_status", [
  "open",
  "resolved",
  "wont_fix",
  "needs_review",
]);

// Element-anchored first, coordinate-anchored fallback (see project decision
// #2): element_selector + element_rect (the element's rect *at pin
// creation time*) let us recompute a fresh x_ratio/y_px after a re-capture
// by re-resolving the selector and reapplying the same relative offset
// within its new bounding box. x_ratio/y_px alone are the fallback used
// when there's no selector (design-pane pins) or it fails to re-resolve.
export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    comparisonId: uuid("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    target: annotationTargetEnum("target").notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    xRatio: numeric("x_ratio", { precision: 12, scale: 8 }).notNull(),
    yPx: integer("y_px").notNull(),
    elementSelector: text("element_selector"),
    elementRect: jsonb("element_rect"),
    status: annotationStatusEnum("status").notNull().default("open"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("annotations_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) is not null
      )`,
    }),
    pgPolicy("annotations_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("annotations_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("annotations_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
  ]
).enableRLS();
