"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { clearCurrentTeamCookie, requireUser, setCurrentTeamCookie } from "@/lib/auth/team";
import { removeTeamStorage } from "@/lib/assets/team-storage";
import { db } from "@/lib/db";
import { teamMembers, teams } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

export async function switchTeam(teamId: string): Promise<ActionResult<true>> {
  if (!isUuid(teamId)) return { success: false, error: "You're not a member of that team." };

  const user = await requireUser();

  const [membership] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return { success: false, error: "You're not a member of that team." };
  }

  await setCurrentTeamCookie(teamId);

  revalidatePath("/", "layout");
  return { success: true, data: true };
}

const teamNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function createTeam(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = teamNameSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await requireUser();
  const baseSlug = slugify(parsed.data.name) || "team";
  let slug = baseSlug;
  for (let i = 1; i <= 20; i++) {
    const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const [team] = await db.insert(teams).values({ name: parsed.data.name, slug }).returning({ id: teams.id });
  await db.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: "owner" });

  await setCurrentTeamCookie(team.id);

  revalidatePath("/", "layout");
  return { success: true, data: team };
}

// Renames the current team. The slug is left alone: it has to stay unique,
// and nothing user-facing shows it.
export async function renameTeam(input: unknown): Promise<ActionResult<true>> {
  const parsed = teamNameSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;

  await db.update(teams).set({ name: parsed.data.name }).where(eq(teams.id, auth.data.team.id));

  revalidatePath("/", "layout");
  return { success: true, data: true };
}

const deleteTeamSchema = z.object({ confirmName: z.string() });

// Deletes the current team and everything in it. The caller has to type the
// team's name, which also guards against deleting a different team than the
// one on screen (the current team is per-browser, so another tab may have
// switched it).
export async function deleteTeam(input: unknown): Promise<ActionResult<true>> {
  const parsed = deleteTeamSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const auth = await authorizeTeamRole("owner");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const user = await requireUser();

  if (parsed.data.confirmName.trim() !== team.name) {
    return { success: false, error: "The name you typed doesn't match this team's name." };
  }

  // getCurrentTeam() needs every signed-in user to belong to at least one
  // team, so the last one can't go. Personal teams (from the signup trigger)
  // aren't flagged as such and are otherwise ordinary teams, so they can be
  // deleted like any other as long as this rule holds.
  const [otherTeam] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), ne(teamMembers.teamId, team.id)))
    .limit(1);
  if (!otherTeam) {
    return { success: false, error: "This is your only team, so it can't be deleted." };
  }

  // Storage goes first: if it fails, the team is still there and deleting it
  // again picks up where this left off. The other way round, a failure would
  // leave objects behind with no team left to delete them through.
  try {
    await removeTeamStorage(team.id);
  } catch (error) {
    console.error(`[teams] could not remove storage for team ${team.id}:`, error);
    return { success: false, error: "Couldn't delete the team's files. Please try again." };
  }

  await db.delete(teams).where(eq(teams.id, team.id));

  // An upload already in flight when the first sweep ran can land after it,
  // so sweep once more now the team row (and with it confirmUpload's team
  // check) is gone. Best effort: the team is already deleted either way.
  try {
    await removeTeamStorage(team.id);
  } catch (error) {
    console.error(`[teams] could not re-sweep storage for deleted team ${team.id}:`, error);
  }

  await clearCurrentTeamCookie();

  revalidatePath("/", "layout");
  return { success: true, data: true };
}
