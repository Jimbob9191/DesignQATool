import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { projects } from "./projects";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Target for the composite foreign key on assets(page_id, project_id) —
    // see assets.ts. Postgres requires a unique constraint on the referenced
    // columns, and pages.id alone is not enough for a two-column reference.
    unique("pages_id_project_id_unique").on(table.id, table.projectId),
    pgPolicy("pages_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from projects
        where projects.id = ${table.projectId} and public.current_team_role(projects.team_id) is not null
      )`,
    }),
    pgPolicy("pages_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (
        select 1 from projects
        where projects.id = ${table.projectId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("pages_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from projects
        where projects.id = ${table.projectId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("pages_delete_non_viewer", {
      for: "delete",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from projects
        where projects.id = ${table.projectId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
  ]
).enableRLS();
