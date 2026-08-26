import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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
import { projects } from "./projects";
import { teams } from "./teams";

export const assetKindEnum = pgEnum("asset_kind", ["design", "capture"]);

// storage_path convention: `${teamId}/${assetId}.${ext}` in the private
// "assets" bucket — see drizzle/0008_asset_storage_bucket.sql for the bucket
// and its storage.objects RLS policies, which check the same team_id prefix.
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // An asset is scoped to a project before it is filed against a specific
    // page, so both are nullable and page_id is the narrower of the two. The
    // pair can never disagree: the composite foreign key below pins page_id to
    // a page of exactly this project, and the CHECK stops a page-assigned
    // asset from omitting its project. This single-column reference still
    // earns its place — the composite key is MATCH SIMPLE, so it goes quiet
    // whenever page_id is NULL, which is precisely the project-library case.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    // No .references() here: the composite foreign key below owns page_id's
    // referential action, and Postgres would otherwise null both columns when
    // a page is deleted, silently evicting the asset from its project too.
    pageId: uuid("page_id"),
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
    index("assets_project_id_idx").on(table.projectId),
    index("assets_page_id_project_id_idx").on(table.pageId, table.projectId),
    // Deleting a page clears page_id only — see the per-column ON DELETE in
    // drizzle/0018. drizzle-kit cannot express that form, so the generated SQL
    // is hand-edited and the snapshot records the plain version: never run
    // db:push against this project, or the constraint is rewritten.
    foreignKey({
      name: "assets_page_id_project_id_pages_fk",
      columns: [table.pageId, table.projectId],
      foreignColumns: [pages.id, pages.projectId],
    }).onDelete("set null"),
    check(
      "assets_page_requires_project",
      sql`${table.pageId} is null or ${table.projectId} is not null`
    ),
    pgPolicy("assets_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) is not null`,
    }),
    // The project named by a write must belong to the same team as the asset.
    // Server Actions use the service-role client and bypass RLS entirely, but
    // `authenticated` holds table grants (drizzle/0004), so PostgREST is a live
    // path. With the CHECK and the composite key above, constraining project_id
    // here transitively constrains page_id too — previously nothing stopped a
    // direct update pointing an asset at another team's page.
    // `assets.team_id` must stay qualified: a bare team_id would resolve to
    // projects.team_id inside the subquery.
    pgPolicy("assets_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')
        and (${table.projectId} is null or exists (
          select 1 from projects
          where projects.id = ${table.projectId} and projects.team_id = assets.team_id
        ))`,
    }),
    pgPolicy("assets_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')
        and (${table.projectId} is null or exists (
          select 1 from projects
          where projects.id = ${table.projectId} and projects.team_id = assets.team_id
        ))`,
    }),
    pgPolicy("assets_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
  ]
).enableRLS();
