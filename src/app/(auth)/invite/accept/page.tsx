import { eq } from "drizzle-orm";
import { ScanEye } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { invitations, teams } from "@/lib/db/schema";
import { LoginForm } from "@/components/auth/login-form";
import { AcceptInvitationCard } from "@/components/team/accept-invitation-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <InviteMessage title="Invalid invite" description="This invite link is missing its token." />;
  }

  const [invitation] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      teamName: teams.name,
    })
    .from(invitations)
    .innerJoin(teams, eq(invitations.teamId, teams.id))
    .where(eq(invitations.token, token))
    .limit(1);

  if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    return (
      <InviteMessage
        title="Invite no longer valid"
        description="This invite has already been used, revoked, or has expired. Ask the team for a new one."
      />
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanEye className="h-5 w-5" />
          </div>
          <CardTitle>Join {invitation.teamName}</CardTitle>
          <CardDescription>
            Sign in as {invitation.email} to accept your invitation as a {invitation.role}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={`/invite/accept?token=${token}`} />
        </CardContent>
      </Card>
    );
  }

  if ((user.email ?? "").toLowerCase() !== invitation.email) {
    return (
      <InviteMessage
        title="Wrong account"
        description={`This invite was sent to ${invitation.email}, but you're signed in as ${user.email}. Sign out and sign back in with the invited address.`}
      />
    );
  }

  return (
    <AcceptInvitationCard token={token} teamName={invitation.teamName} role={invitation.role} />
  );
}

function InviteMessage({ title, description }: { title: string; description: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
