"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { isUuid, type ActionResult } from "@/lib/actions/result";
import { requireUser, setCurrentTeamCookie } from "@/lib/auth/team";
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

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function createTeam(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createTeamSchema.safeParse(input);
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
