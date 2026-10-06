import { sql } from "drizzle-orm";
import { boolean, index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { comparisons } from "./comparisons";

// The public share page (src/app/share/[token]) is rendered entirely
// through the RLS-bypassing `db` client and signed Storage URLs — same
// server-first pattern as the Phase 8 PDF print route — so unlike
// invitations/teams these RLS policies are purely defense-in-depth for
// direct Supabase-client access, not the app's actual authorization
// boundary for the share page itself.
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    comparisonId: uuid("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    allowAnonymousComments: boolean("allow_anonymous_comments").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Nullable and set null on delete so removing a user leaves the team's
    // shared work in place, attributed to "Former member".
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("share_links_comparison_id_created_at_idx").on(table.comparisonId, table.createdAt),
    pgPolicy("share_links_select_team_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) is not null
      )`,
    }),
    pgPolicy("share_links_insert_non_viewer", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.createdBy} = auth.uid() and exists (
        select 1 from comparisons
        join pages on pages.id = comparisons.page_id
        join projects on projects.id = pages.project_id
        where comparisons.id = ${table.comparisonId} and public.current_team_role(projects.team_id) in ('owner', 'admin', 'member')
      )`,
    }),
    pgPolicy("share_links_delete_non_viewer", {
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
