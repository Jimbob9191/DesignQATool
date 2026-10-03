import { sql } from "drizzle-orm";
import { pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { teamRoleEnum, teams } from "./teams";

export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "revoked"]);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: teamRoleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The accept flow runs entirely through Server Actions on the
    // RLS-bypassing `db` client (see teams.ts's RLS note), so these policies
    // only matter for direct Supabase-client access, not app functionality.
    pgPolicy("invitations_select_owner_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
    // Never role='owner': accepting one would let an admin mint an owner
    // (e.g. an alt account of their own). Ownership is only ever granted
    // through updateMemberRole by an existing owner.
    pgPolicy("invitations_insert_owner_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin')
        and ${table.role} <> 'owner'
        and ${table.invitedBy} = auth.uid()`,
    }),
    pgPolicy("invitations_delete_owner_admin", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.current_team_role(${table.teamId}) in ('owner', 'admin')`,
    }),
  ]
).enableRLS();
