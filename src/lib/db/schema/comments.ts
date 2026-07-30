import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { annotations } from "./annotations";

// An annotation IS the thread — comments are a flat, chronological list
// under a pin, not a nested tree (see project decision #3).
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    annotationId: uuid("annotation_id")
      .notNull()
      .references(() => annotations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Nullable to allow anonymous comments from public share links (Phase 9)
    // — those set guestName instead. Authenticated comments always set
    // createdBy and leave guestName null.
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "cascade" }),
    guestName: text("guest_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [
    pgPolicy("comments_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = ${table.annotationId} and public.current_team_role(projects.team_id) is not null
      )`,
    }),
    pgPolicy("comments_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (
        select 1 from annotations
        join comparisons on comparisons.id = annotations.comparison_id
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where annotations.id = ${table.annotationId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("comments_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.createdBy} = auth.uid()`,
    }),
    pgPolicy("comments_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.createdBy} = auth.uid()`,
    }),
  ]
).enableRLS();
