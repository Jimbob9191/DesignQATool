import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { teams } from "./teams";

// As with team_members, our server-side Drizzle client bypasses RLS (it
// connects as the table owner), so Server Actions must still scope every
// mutation by the caller's team_id explicitly — RLS here is the enforcement
// boundary for direct/Realtime client access, not a substitute for that.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    baseUrl: text("base_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_team_id_slug_unique").on(table.teamId, table.slug),
    pgPolicy("projects_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) is not null`,
    }),
    // viewers can read but not write, per the role model finalized in Phase 9
    pgPolicy("projects_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
    pgPolicy("projects_update_non_viewer", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin', 'member')`,
    }),
    pgPolicy("projects_delete_owner_admin", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
  ]
).enableRLS();
