"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { removeMember, updateMemberRole } from "@/lib/actions/team-members";
import type { TeamRole } from "@/lib/auth/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

const ROLE_OPTIONS: TeamRole[] = ["owner", "admin", "member", "viewer"];

export function MemberRow({
  member,
  canManage,
  isCallerOwner,
}: {
  member: { userId: string; email: string; role: TeamRole };
  canManage: boolean;
  isCallerOwner: boolean;
}) {
  const router = useRouter();

  async function handleRoleChange(role: string) {
    const result = await updateMemberRole(member.userId, role);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Role updated");
    router.refresh();
  }

  const canChangeThisRole = canManage && (isCallerOwner || member.role !== "owner");
  const canRemoveThisMember = canManage && member.role !== "owner";

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.email}</p>
      </div>

      {canChangeThisRole ? (
        <Select value={member.role} onValueChange={handleRoleChange}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem
                key={option}
                value={option}
                disabled={option === "owner" && !isCallerOwner}
                className="capitalize"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="w-32 justify-center capitalize">
          {member.role}
        </Badge>
      )}

      {canRemoveThisMember ? (
        <ConfirmDeleteDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label="Remove member">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          }
          title={`Remove ${member.email}?`}
          description="They'll lose access to this team's projects immediately."
          onConfirm={async () => {
            const result = await removeMember(member.userId);
            if (!result.success) throw new Error(result.error);
            toast.success("Member removed");
            router.refresh();
          }}
        />
      ) : (
        <div className="w-9" />
      )}
    </div>
  );
}
