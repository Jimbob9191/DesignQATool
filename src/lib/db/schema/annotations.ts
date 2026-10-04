import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
// For pins on a live comparison's site there is no image: asset_id is null,
// x_ratio/y_px are in the page's document space at the comparison's
// viewport width, page_url says which page of the site the pin is on, and
// element_text lets the bridge find the element again if its selector
// stops matching.
// The caller can edit the comparison, and asset_id (if any) is one of that team's assets.
function editableWithTeamAsset(table: { comparisonId: AnyPgColumn; assetId: AnyPgColumn }) {
  return sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and (${table.assetId} is null
            or exists (select 1 from assets where assets.id = ${table.assetId} and assets.team_id = projects.team_id))
      )`;
}

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    comparisonId: uuid("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    target: annotationTargetEnum("target").notNull(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    xRatio: numeric("x_ratio", { precision: 12, scale: 8 }).notNull(),
    yPx: integer("y_px").notNull(),
    elementSelector: text("element_selector"),
    elementRect: jsonb("element_rect"),
    elementText: text("element_text"),
    pageUrl: text("page_url"),
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
      withCheck: sql`${table.createdBy} = auth.uid() and ${editableWithTeamAsset(table)}`,
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
      withCheck: editableWithTeamAsset(table),
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
