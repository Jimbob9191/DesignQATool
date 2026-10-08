"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { getCurrentUser, setCurrentTeamCookie } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { invitations, teamMembers } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/resend";
import { invitationEmail } from "@/lib/email/templates";
import { invitationAcceptUrl } from "@/lib/invitations";
import { consumeRateLimits } from "@/lib/rate-limit";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Each invite or resend emails an arbitrary address from our domain, so both
// count against the same budget.
function consumeInviteRateLimits(inviterId: string, teamId: string): Promise<boolean> {
  return consumeRateLimits([
    [`invite:user:${inviterId}`, 20, 60 * 60],
    [`invite:team:${teamId}`, 50, 60 * 60],
  ]);
}

function sendInvitationEmail(input: {
  to: string;
  token: string;
  inviterLabel: string;
  teamName: string;
  role: string;
}) {
  return sendEmail({
    to: input.to,
    ...invitationEmail({
      inviterLabel: input.inviterLabel,
      teamName: input.teamName,
      role: input.role,
      acceptUrl: invitationAcceptUrl(input.token),
    }),
  });
}

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function inviteMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const inviter = await getCurrentUser();
  if (!inviter) return { success: false, error: "Not signed in." };

  const email = parsed.data.email.toLowerCase();

  const allowed = await consumeInviteRateLimits(inviter.id, team.id);
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

  const emailResult = await sendInvitationEmail({
    to: email,
    token,
    inviterLabel: inviter.email ?? "Someone",
    teamName: team.name,
    role: parsed.data.role,
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

/**
 * Re-sends a pending invite's email and restarts its expiry clock, for when
 * the first email bounced, got lost, or sat unread until the link expired.
 * The token is kept, so a link an admin already shared by hand keeps working.
 */
export async function resendInvitation(invitationId: string): Promise<ActionResult<true>> {
  if (!isUuid(invitationId)) return { success: false, error: "Invite not found." };

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const inviter = await getCurrentUser();
  if (!inviter) return { success: false, error: "Not signed in." };

  const allowed = await consumeInviteRateLimits(inviter.id, team.id);
  if (!allowed) {
    return { success: false, error: "Too many invites sent recently. Try again in an hour." };
  }

  const [invitation] = await db
    .update(invitations)
    .set({ expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
    .where(and(eq(invitations.id, invitationId), eq(invitations.teamId, team.id), eq(invitations.status, "pending")))
    .returning({ email: invitations.email, role: invitations.role, token: invitations.token });
  if (!invitation) return { success: false, error: "That invite was already accepted or revoked." };

  const emailResult = await sendInvitationEmail({
    to: invitation.email,
    token: invitation.token,
    inviterLabel: inviter.email ?? "Someone",
    teamName: team.name,
    role: invitation.role,
  });

  revalidatePath("/team");

  if (!emailResult.sent) {
    return {
      success: true,
      data: true,
      warning: `Invite extended, but the email failed to send: ${emailResult.error}`,
    };
  }
  return { success: true, data: true };
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult<true>> {
  if (!isUuid(invitationId)) return { success: false, error: "Invite not found." };

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [revoked] = await db
    .update(invitations)
    .set({ status: "revoked" })
    .where(and(eq(invitations.id, invitationId), eq(invitations.teamId, team.id), eq(invitations.status, "pending")))
    .returning({ id: invitations.id });
  if (!revoked) return { success: false, error: "That invite was already accepted or revoked." };

  revalidatePath("/team");
  return { success: true, data: true };
}

export async function acceptInvitation(token: string): Promise<ActionResult<{ teamId: string }>> {
  if (typeof token !== "string" || token.length === 0) {
    return { success: false, error: "This invite is invalid or has expired." };
  }

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
