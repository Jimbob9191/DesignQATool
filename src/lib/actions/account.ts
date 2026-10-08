"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { ActionResult } from "@/lib/actions/result";
import { removeTeamStorage } from "@/lib/assets/team-storage";
import { listTeamNames, planAccountDeletion } from "@/lib/auth/account-deletion";
import {
  fieldErrorsFrom,
  friendlyAuthError,
  TOO_MANY_ATTEMPTS,
  type AuthFormState,
} from "@/lib/auth/form-state";
import { CURRENT_TEAM_COOKIE, getCurrentUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { teamMembers, teams } from "@/lib/db/schema";
import { consumePasswordAttempt } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validations/auth";

const SESSION_EXPIRED = "Your session has expired. Sign in again and retry.";

export async function changePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    return { status: "error", message: SESSION_EXPIRED };
  }

  // Checking the current password is as good a guessing oracle as the sign-in
  // form, so it draws on the same limits.
  if (!(await consumePasswordAttempt(user.email))) {
    return { status: "error", message: TOO_MANY_ATTEMPTS };
  }

  // Signing in again is the only way Supabase offers to check a password. A
  // failed attempt leaves the existing session alone; a successful one swaps
  // in a fresh session for the same user, which also satisfies the "recent
  // sign-in" rule if the project has Secure Password Change turned on.
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    if (verifyError.message.toLowerCase().includes("invalid login credentials")) {
      return {
        status: "error",
        fieldErrors: { currentPassword: "That isn't your current password" },
      };
    }
    return { status: "error", message: friendlyAuthError(verifyError) };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: friendlyAuthError(error) };
  }

  return { status: "success", message: "Password updated." };
}

/**
 * Permanently deletes the signed-in user. Content they authored in shared
 * teams stays behind as "Former member" (created_by is set null on delete);
 * teams where they're the only member are deleted outright, files included.
 *
 * Redirects to /login on success, so it only ever returns a failure.
 */
export async function deleteAccount(confirmEmail: unknown): Promise<ActionResult<never>> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return { success: false, error: SESSION_EXPIRED };
  }

  if (
    typeof confirmEmail !== "string" ||
    confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return { success: false, error: "Type your email address exactly as shown to confirm." };
  }

  const memberships = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      role: teamMembers.role,
      memberCount: sql<number>`(select count(*) from team_members m where m.team_id = ${teams.id})`.mapWith(Number),
      ownerCount: sql<number>`(select count(*) from team_members m where m.team_id = ${teams.id} and m.role = 'owner')`.mapWith(Number),
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, user.id));

  const plan = planAccountDeletion(memberships);
  if (!plan.ok) {
    const names = listTeamNames(plan.blockingTeamNames);
    const them = plan.blockingTeamNames.length === 1 ? "that team" : "those teams";
    return {
      success: false,
      error: `You're the only owner of ${names}, which other people still use. Make someone else an owner of ${them} (or remove its other members) first.`,
    };
  }

  // The user goes before their teams. Deleting the teams first and then
  // failing here would leave a signed-in user with no team at all, which the
  // app can't render; the reverse failure only leaves memberless teams.
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[account] could not delete auth user:", deleteError.message);
    return { success: false, error: "We couldn't delete your account. Try again." };
  }

  if (plan.soleMemberTeamIds.length > 0) {
    try {
      // Only teams that are now empty: someone may have accepted an invite to
      // one of them since the plan was made, and it's theirs now.
      const deleted = await db
        .delete(teams)
        .where(
          and(
            inArray(teams.id, plan.soleMemberTeamIds),
            sql`not exists (select 1 from team_members m where m.team_id = ${teams.id})`
          )
        )
        .returning({ id: teams.id });

      // One team's Storage failing shouldn't leave the others' files behind.
      for (const { id } of deleted) {
        await removeTeamStorage(id).catch((error) => {
          console.error(`[account] could not remove storage for team ${id}:`, error);
        });
      }
    } catch (error) {
      // The account is already gone, so there's no failure worth showing; a
      // memberless team is unreachable.
      console.error("[account] could not delete the user's empty teams:", error);
    }
  }

  // Local scope: the user's sessions were deleted with them, so there's
  // nothing for a global sign-out to revoke. This just clears the cookies.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(CURRENT_TEAM_COOKIE);

  redirect("/login");
}
