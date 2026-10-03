import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { assets } from "./assets";
import { pages } from "./pages";

export const comparisons = pgTable(
  "comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    designAssetId: uuid("design_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    captureAssetId: uuid("capture_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("comparisons_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = ${table.pageId} and public.current_team_role(projects.team_id) is not null
      )`,
    }),
    // Both assets must belong to the page's team: the comparison view signs
    // URLs for them server-side, so a foreign asset id here would leak
    // another team's image.
    pgPolicy("comparisons_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.createdBy} = auth.uid() and exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = ${table.pageId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
          and exists (select 1 from assets where assets.id = ${table.designAssetId} and assets.team_id = projects.team_id)
          and exists (select 1 from assets where assets.id = ${table.captureAssetId} and assets.team_id = projects.team_id)
      )`,
    }),
    pgPolicy("comparisons_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from pages join projects on projects.id = pages.project_id
        where pages.id = ${table.pageId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
  ]
).enableRLS();
