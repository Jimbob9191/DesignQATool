"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { getCurrentUser, type TeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";

const roleSchema = z.enum(["owner", "admin", "member", "viewer"]);

async function countOwners(teamId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "owner")));
  return row?.count ?? 0;
}

export async function updateMemberRole(
  memberUserId: string,
  role: unknown
): Promise<ActionResult<true>> {
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) {
    return { success: false, error: "Invalid role." };
  }
  if (!isUuid(memberUserId)) return { success: false, error: "Member not found." };

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;
  const { team, role: callerRole } = auth.data;

  const [existing] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, memberUserId)))
    .limit(1);
  if (!existing) {
    return { success: false, error: "Member not found." };
  }

  // Only an owner can touch ownership — grant it, or change an existing
  // owner's role — so an admin can't self-escalate or demote an owner.
  if (callerRole !== "owner") {
    if (existing.role === "owner") {
      return { success: false, error: "Only an owner can change another owner's role." };
    }
    if (parsedRole.data === "owner") {
      return { success: false, error: "Only an owner can grant ownership." };
    }
  }

  if (existing.role === "owner" && parsedRole.data !== "owner" && (await countOwners(team.id)) <= 1) {
    return { success: false, error: "A team must have at least one owner." };
  }

  await db
    .update(teamMembers)
    .set({ role: parsedRole.data })
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, memberUserId)));

  revalidatePath("/team");
  return { success: true, data: true };
}

export async function removeMember(memberUserId: string): Promise<ActionResult<true>> {
  if (!isUuid(memberUserId)) return { success: false, error: "Member not found." };

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [existing] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, memberUserId)))
    .limit(1);
  if (!existing) {
    return { success: true, data: true };
  }

  // Owners can't be removed directly (the delete below excludes role='owner'
  // rows too, as a second line of defense) — demote via updateMemberRole
  // first, which itself refuses to demote a sole remaining owner.
  if (existing.role === "owner") {
    return { success: false, error: "Demote this member before removing them." };
  }

  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, team.id),
        eq(teamMembers.userId, memberUserId),
        ne(teamMembers.role, "owner")
      )
    );

  revalidatePath("/team");
  return { success: true, data: true };
}

// removeMember requires admin — a plain member/viewer has no way to remove
// themselves through it, so leaving your own team needs its own action.
export async function leaveTeam(): Promise<ActionResult<true>> {
  const auth = await authorizeTeamRole("viewer");
  if (!auth.success) return auth;
  const { team, role } = auth.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  if (role === "owner") {
    return { success: false, error: "Transfer ownership to someone else before leaving." };
  }

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, user.id)));

  revalidatePath("/", "layout");
  return { success: true, data: true };
}

export type { TeamRole };
