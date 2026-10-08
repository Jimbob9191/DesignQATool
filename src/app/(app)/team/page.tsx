import { and, asc, desc, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { getCurrentTeam, getUserTeams } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { invitations, teamMembers } from "@/lib/db/schema";
import { invitationAcceptUrl } from "@/lib/invitations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";
import { InvitationRow } from "@/components/team/invitation-row";
import { MemberRow } from "@/components/team/member-row";
import { LeaveTeamButton } from "@/components/team/leave-team-button";
import { DeleteTeamButton, RenameTeamForm } from "@/components/team/team-settings";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

// Worked out here rather than in the client row, so the server and browser
// clocks can't disagree and trip a hydration mismatch.
function expiryLabel(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "Expired — resend to reactivate";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "Expires in under an hour";
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

export default async function TeamPage() {
  const { team, role } = await getCurrentTeam();
  const canManage = role === "owner" || role === "admin";

  const [members, pendingInvitations, memberships] = await Promise.all([
    db
      .select({ userId: teamMembers.userId, role: teamMembers.role, email: authUsers.email })
      .from(teamMembers)
      .innerJoin(authUsers, eq(teamMembers.userId, authUsers.id))
      .where(eq(teamMembers.teamId, team.id))
      .orderBy(asc(teamMembers.createdAt)),
    canManage
      ? db
          .select({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
            token: invitations.token,
            expiresAt: invitations.expiresAt,
          })
          .from(invitations)
          .where(and(eq(invitations.teamId, team.id), eq(invitations.status, "pending")))
          .orderBy(desc(invitations.createdAt))
      : [],
    getUserTeams(),
  ]);
  // deleteTeam refuses to delete the user's only team; mirror that here.
  const canDeleteTeam = memberships.length > 1;

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
              <InvitationRow
                key={invitation.id}
                invitation={{
                  id: invitation.id,
                  email: invitation.email,
                  role: invitation.role,
                  acceptUrl: invitationAcceptUrl(invitation.token),
                  expiryLabel: expiryLabel(invitation.expiresAt),
                  expired: invitation.expiresAt.getTime() <= Date.now(),
                }}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <RenameTeamForm key={team.id} teamName={team.name} />
          </CardContent>
        </Card>
      ) : null}

      {role === "owner" ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Delete team</CardTitle>
            <CardDescription>
              {canDeleteTeam
                ? "Permanently delete this team, its projects, and all of its uploads."
                : "This is your only team, so it can’t be deleted."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteTeamButton teamName={team.name} canDelete={canDeleteTeam} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
