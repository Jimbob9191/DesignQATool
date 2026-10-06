import { sql } from "drizzle-orm";
import { type AnyPgColumn, index, pgPolicy, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { teamRoleEnum, teams } from "./teams";

// Owners can manage any membership row; admins only non-owner rows. Applied
// to both the old and new row on update, so an admin can neither touch an
// owner nor promote anyone (themselves included) to owner — mirroring
// updateMemberRole/removeMember for direct Supabase-client access.
function managesMember(table: { teamId: AnyPgColumn; role: AnyPgColumn }) {
  return sql`(
        public.current_team_role(${table.teamId}) = 'owner'
        or (public.current_team_role(${table.teamId}) = 'admin' and ${table.role} <> 'owner')
      )`;
}

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
    // The PK leads with team_id, so it can't serve "which teams is this user
    // in" — the lookup behind every page load and the RLS membership helpers.
    index("team_members_user_id_idx").on(table.userId),
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
      ) or ${managesMember(table)}`,
    }),
    // withCheck matters as much as using here: without it, an admin could
    // update their own row to role='owner'.
    pgPolicy("team_members_update_owner_admin", {
      for: "update",
      to: authenticatedRole,
      using: managesMember(table),
      withCheck: managesMember(table),
    }),
    // Anyone but an owner may remove their own row (leaveTeam); everything
    // else follows managesMember, so admins can't remove owners.
    pgPolicy("team_members_delete_owner_admin_or_self", {
      for: "delete",
      to: authenticatedRole,
      using: sql`(${table.userId} = auth.uid() and ${table.role} <> 'owner') or ${managesMember(table)}`,
    }),
  ]
).enableRLS();
