"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { z } from "zod";

import { getCurrentUser, requireTeamRole, setCurrentTeamCookie } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { invitations, teamMembers } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/resend";
import { invitationEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { consumeRateLimits } from "@/lib/rate-limit";

type ActionResult<T> =
  | { success: true; data: T; warning?: string }
  | { success: false; error: string };

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function inviteMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("admin");
  const inviter = await getCurrentUser();
  if (!inviter) return { success: false, error: "Not signed in." };

  const email = parsed.data.email.toLowerCase();

  // Each invite emails an arbitrary address from our domain.
  const allowed = await consumeRateLimits([
    [`invite:user:${inviter.id}`, 20, 60 * 60],
    [`invite:team:${team.id}`, 50, 60 * 60],
  ]);
  if (!allowed) {
    return { success: false, error: "Too many invites sent recently. Try again in an hour." };
  }

  const [existingMember] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(authUsers, eq(teamMembers.userId, authUsers.id))
    .where(and(eq(teamMembers.teamId, team.id), eq(authUsers.email, email)))
    .limit(1);
  if (existingMember) {
    return { success: false, error: "That person is already on this team." };
  }

  const [existingInvite] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(eq(invitations.teamId, team.id), eq(invitations.email, email), eq(invitations.status, "pending"))
    )
    .limit(1);
  if (existingInvite) {
    return { success: false, error: "There's already a pending invite for that email." };
  }

  const token = randomBytes(24).toString("hex");
  const [invitation] = await db
    .insert(invitations)
    .values({
      teamId: team.id,
      email,
      role: parsed.data.role,
      token,
      invitedBy: inviter.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning({ id: invitations.id });

  const acceptUrl = `${env.NEXT_PUBLIC_SITE_URL}/invite/accept?token=${token}`;
  const emailResult = await sendEmail({
    to: email,
    ...invitationEmail({
      inviterLabel: inviter.email ?? "Someone",
      teamName: team.name,
      role: parsed.data.role,
      acceptUrl,
    }),
  });

  revalidatePath("/team");

  // The invite row exists either way — accepting doesn't depend on the
  // email arriving, so a delivery failure is a warning, not a hard error.
  if (!emailResult.sent) {
    return {
      success: true,
      data: invitation,
      warning: `Invite created, but the email failed to send: ${emailResult.error}`,
    };
  }
  return { success: true, data: invitation };
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult<true>> {
  const { team } = await requireTeamRole("admin");

  await db
    .update(invitations)
    .set({ status: "revoked" })
    .where(and(eq(invitations.id, invitationId), eq(invitations.teamId, team.id), eq(invitations.status, "pending")));

  revalidatePath("/team");
  return { success: true, data: true };
}

export async function acceptInvitation(token: string): Promise<ActionResult<{ teamId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    return { success: false, error: "This invite is invalid or has expired." };
  }

  if ((user.email ?? "").toLowerCase() !== invitation.email) {
    return {
      success: false,
      error: `This invite was sent to ${invitation.email}, not ${user.email}.`,
    };
  }

  const [existingMembership] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, invitation.teamId), eq(teamMembers.userId, user.id)))
    .limit(1);

  if (!existingMembership) {
    await db.insert(teamMembers).values({
      teamId: invitation.teamId,
      userId: user.id,
      role: invitation.role,
    });
  }

  await db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invitation.id));

  await setCurrentTeamCookie(invitation.teamId);

  revalidatePath("/", "layout");
  return { success: true, data: { teamId: invitation.teamId } };
}
