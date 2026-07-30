"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { leaveTeam } from "@/lib/actions/team-members";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

export function LeaveTeamButton() {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={<Button variant="outline">Leave team</Button>}
      title="Leave this team?"
      description="You'll lose access to its projects immediately. You can be re-invited later."
      onConfirm={async () => {
        const result = await leaveTeam();
        if (!result.success) throw new Error(result.error);
        toast.success("Left team");
        router.push("/dashboard");
        router.refresh();
      }}
    />
  );
}
