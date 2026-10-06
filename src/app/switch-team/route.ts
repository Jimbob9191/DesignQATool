import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { safeNext } from "@/lib/auth/form-state";
import { requireUser, setCurrentTeamCookie } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";

// Selects a team and then continues to `next`. Detail pages redirect here
// (via redirectToOwningTeam) when the link they were opened from belongs to
// another of the user's teams; Server Components can't set the team cookie
// themselves, but a Route Handler can.
//
// This is a GET so a plain redirect can reach it. All it can do is select a
// team the user already belongs to, so a cross-site link to it is harmless.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("to") ?? "";
  // safeNext, not the raw param: redirect() would follow an absolute URL
  // straight off-site.
  const next = safeNext(searchParams.get("next"));

  const [membership] = /^[0-9a-f-]{36}$/i.test(teamId)
    ? await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
        .limit(1)
    : [];

  // Not a member (left the team, or a hand-edited URL): go to the dashboard
  // rather than `next`, which would only 404.
  if (!membership) {
    redirect("/dashboard");
  }

  await setCurrentTeamCookie(teamId);
  redirect(next);
}
