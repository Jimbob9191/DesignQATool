import { and, asc, desc, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { getCurrentTeam } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { invitations, teamMembers } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";
import { InvitationRow } from "@/components/team/invitation-row";
import { MemberRow } from "@/components/team/member-row";
import { LeaveTeamButton } from "@/components/team/leave-team-button";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export default async function TeamPage() {
  const { team, role } = await getCurrentTeam();
  const canManage = role === "owner" || role === "admin";

  const [members, pendingInvitations] = await Promise.all([
    db
      .select({ userId: teamMembers.userId, role: teamMembers.role, email: authUsers.email })
      .from(teamMembers)
      .innerJoin(authUsers, eq(teamMembers.userId, authUsers.id))
      .where(eq(teamMembers.teamId, team.id))
      .orderBy(asc(teamMembers.createdAt)),
    canManage
      ? db
          .select({ id: invitations.id, email: invitations.email, role: invitations.role })
          .from(invitations)
          .where(and(eq(invitations.teamId, team.id), eq(invitations.status, "pending")))
          .orderBy(desc(invitations.createdAt))
      : [],
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground">{team.name}&rsquo;s members and roles.</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <InviteMemberDialog
              trigger={
                <Button>
                  <UserPlus className="h-4 w-4" />
                  Invite member
                </Button>
              }
            />
          ) : null}
          {role !== "owner" ? <LeaveTeamButton /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={{ userId: member.userId, email: member.email ?? "unknown", role: member.role }}
              canManage={canManage}
              isCallerOwner={role === "owner"}
            />
          ))}
        </CardContent>
      </Card>

      {canManage && pendingInvitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations ({pendingInvitations.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {pendingInvitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
