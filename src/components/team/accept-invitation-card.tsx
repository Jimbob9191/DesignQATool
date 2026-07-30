"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanEye } from "lucide-react";
import { toast } from "sonner";

import { acceptInvitation } from "@/lib/actions/invitations";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AcceptInvitationCard({
  token,
  teamName,
  role,
}: {
  token: string;
  teamName: string;
  role: string;
}) {
  const router = useRouter();
  const [isAccepting, setIsAccepting] = useState(false);

  async function handleAccept() {
    setIsAccepting(true);
    const result = await acceptInvitation(token);
    setIsAccepting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Joined ${teamName}`);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanEye className="h-5 w-5" />
        </div>
        <CardTitle>Join {teamName}</CardTitle>
        <CardDescription>You&rsquo;ve been invited as a {role}.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" onClick={handleAccept} disabled={isAccepting}>
          Accept invitation
        </Button>
      </CardFooter>
    </Card>
  );
}
