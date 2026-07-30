"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { revokeInvitation } from "@/lib/actions/invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function InvitationRow({
  invitation,
}: {
  invitation: { id: string; email: string; role: string };
}) {
  const router = useRouter();

  async function handleRevoke() {
    const result = await revokeInvitation(invitation.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Invitation revoked");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{invitation.email}</p>
      <Badge variant="outline" className="w-24 justify-center capitalize">
        {invitation.role}
      </Badge>
      <Button variant="ghost" size="icon" aria-label="Revoke invitation" onClick={handleRevoke}>
        <X className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
