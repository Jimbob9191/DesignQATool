import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { teamRoleEnum, teams } from "./teams";

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    // See teams.ts for why membership checks go through SECURITY DEFINER
    // functions instead of inline subqueries on this table.
    pgPolicy("team_members_select_same_team", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) is not null`,
    }),
    // Bootstrap case: a user creating a brand-new team is allowed to insert
    // themselves as its first (and therefore owner) member. Adding anyone
    // else requires existing owner/admin membership on that team.
    pgPolicy("team_members_insert_bootstrap_or_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`(
        ${table.userId} = auth.uid()
        and public.team_member_count(${table.teamId}) = 0
      ) or public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
    pgPolicy("team_members_update_owner_admin", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
    pgPolicy("team_members_delete_owner_admin_or_self", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid() or public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
  ]
).enableRLS();
