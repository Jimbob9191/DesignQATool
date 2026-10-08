import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, type SQL } from "drizzle-orm";

import { switchTeamHref } from "@/lib/auth/team-switch";
import { db } from "@/lib/db";
import { comparisons, pages, projects, teamMembers, teams } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export const CURRENT_TEAM_COOKIE = "current_team_id";

// Only callable from a Server Action or Route Handler (switchTeam(),
// createTeam(), deleteTeam(), acceptInvitation() and the /switch-team route):
// Server Components can't write cookies during render.
export async function setCurrentTeamCookie(teamId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_TEAM_COOKIE, teamId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentTeamCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(CURRENT_TEAM_COOKIE);
}

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

export function hasTeamRole(role: TeamRole, minRole: TeamRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

// A detail page calls this when its resource isn't in the current team, just
// before it 404s. If the resource belongs to another team the user is in — a
// notification email for team B while team A is selected, or a link from a
// tab opened before a team switch — it redirects through /switch-team to
// select that team and come back to `path`. Otherwise it returns and the page
// 404s as before.
//
// The lookup only searches the user's *other* teams, so it reveals nothing
// about teams they aren't in, and can't loop back to the current team when a
// page 404s for some other reason. Project slugs are only unique within a
// team, so if several of the user's teams have a matching project, the
// oldest membership wins, the same rule getCurrentTeam() falls back on.
export async function redirectToOwningTeam(
  resource: { projectSlug: string; pageId?: string; comparisonId?: string },
  path: string
): Promise<void> {
  const [memberships, current] = await Promise.all([getUserTeams(), getCurrentTeam()]);
  const otherTeamIds = memberships.map((m) => m.team.id).filter((id) => id !== current.team.id);
  if (otherTeamIds.length === 0) return;

  const conditions: SQL[] = [
    eq(projects.slug, resource.projectSlug),
    inArray(projects.teamId, otherTeamIds),
  ];
  let query = db.selectDistinct({ teamId: projects.teamId }).from(projects).$dynamic();
  if (resource.pageId) {
    query = query.innerJoin(pages, eq(pages.projectId, projects.id));
    conditions.push(eq(pages.id, resource.pageId));
  }
  if (resource.pageId && resource.comparisonId) {
    query = query.innerJoin(comparisons, eq(comparisons.pageId, pages.id));
    conditions.push(eq(comparisons.id, resource.comparisonId));
  }
  const owners = new Set((await query.where(and(...conditions))).map((r) => r.teamId));

  const owner = otherTeamIds.find((id) => owners.has(id));
  if (owner) {
    redirect(switchTeamHref(owner, path));
  }
}
