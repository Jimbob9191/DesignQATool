import { sql } from "drizzle-orm";
import { pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "member", "viewer"]);

// RLS note: our own server-side Drizzle client connects as the Postgres table
// owner (via DATABASE_URL), so it bypasses RLS like any Postgres owner does —
// Server Actions are authorized in application code via requireTeamRole() /
// getCurrentTeam() (see src/lib/auth/team.ts). These policies are the real
// enforcement boundary for anything that talks to Postgres as the
// "authenticated" role directly: Supabase Realtime (Phase 7) and public
// share links (Phase 9).
//
// Membership checks go through the public.current_team_role() /
// public.team_member_count() SECURITY DEFINER functions (see the
// membership_helper_functions migration) rather than inline subqueries on
// team_members — a policy on team_members that subqueries team_members
// directly causes "infinite recursion detected in policy" in Postgres,
// since evaluating the subquery re-triggers team_members' own RLS policy.
// SECURITY DEFINER functions run as their owner (the migration role, which
// owns these tables and therefore bypasses RLS), breaking the cycle.
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("teams_select_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.id}) is not null`,
    }),
    pgPolicy("teams_insert_authenticated", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`true`,
    }),
    pgPolicy("teams_update_owner_admin", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.id}) in ('owner', 'admin')`,
    }),
    pgPolicy("teams_delete_owner", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.id}) = 'owner'`,
    }),
  ]
).enableRLS();
