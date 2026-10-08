"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { resendInvitation, revokeInvitation } from "@/lib/actions/invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type InvitationRowData = {
  id: string;
  email: string;
  role: string;
  acceptUrl: string;
  expiryLabel: string;
  expired: boolean;
};

export function InvitationRow({ invitation }: { invitation: InvitationRowData }) {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleResend() {
    setIsResending(true);
    const result = await resendInvitation(invitation.id);
    setIsResending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    if (result.warning) toast.warning(result.warning);
    else toast.success(`Invitation resent to ${invitation.email}`);
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invitation.acceptUrl);
    } catch {
      toast.error("Couldn't copy the link. Your browser blocked clipboard access.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className={invitation.expired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {invitation.expiryLabel}
        </p>
      </div>
      <Badge variant="outline" className="w-24 justify-center capitalize">
        {invitation.role}
      </Badge>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Copy invite link" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy invite link"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Resend invitation"
              onClick={handleResend}
              disabled={isResending}
            >
              {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Resend email and extend for 7 days</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Revoke invitation" onClick={handleRevoke}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Revoke invitation</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
