import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { teamMembers, teams } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export const CURRENT_TEAM_COOKIE = "current_team_id";

export type CurrentUser = { id: string; email: string | undefined };

// getClaims() verifies the session JWT locally when the project uses
// asymmetric signing keys (falling back to an Auth server round trip for
// legacy symmetric secrets), so every page render isn't blocked on a network
// call to Supabase Auth. Callers only need the user's id and email, both of
// which are in the verified claims.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) return null;
  return { id: data.claims.sub, email: data.claims.email };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

// Every team the signed-in user belongs to, oldest membership first. Backs
// both getCurrentTeam() below and the team-switcher UI — cache() dedupes
// this within a single request so both call sites share one query.
export const getUserTeams = cache(async () => {
  const user = await requireUser();

  return db
    .select({ team: teams, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, user.id))
    .orderBy(teamMembers.createdAt);
});

// The team the user is currently working in: whichever team the
// current_team_id cookie names, provided the user still belongs to it;
// otherwise their oldest team (their personal team, created by the signup
// trigger). The cookie is only ever set by the switchTeam() Server Action —
// Server Components can't write cookies during render, so there's no
// fallback write here even when the cookie is missing/stale.
export const getCurrentTeam = cache(async () => {
  const memberships = await getUserTeams();

  if (memberships.length === 0) {
    throw new Error(
      "Signed-in user has no team. Check that the personal_team_on_signup trigger ran."
    );
  }

  const cookieStore = await cookies();
  const preferredTeamId = cookieStore.get(CURRENT_TEAM_COOKIE)?.value;
  const preferred = preferredTeamId
    ? memberships.find((m) => m.team.id === preferredTeamId)
    : undefined;

  return preferred ?? memberships[0];
});

export async function requireTeamRole(minRole: TeamRole) {
  const membership = await getCurrentTeam();
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new Error(`Requires ${minRole} role or higher; current role is ${membership.role}.`);
  }
  return membership;
}
