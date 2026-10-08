"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createShareLink, revokeShareLink } from "@/lib/actions/share-links";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ShareLinkData = { id: string; url: string; allowAnonymousComments: boolean; expiresAt: string | null };

export function ShareLinkDialog({
  open,
  onOpenChange,
  comparisonId,
  existingLinks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparisonId: string;
  existingLinks: ShareLinkData[];
}) {
  const router = useRouter();
  const [allowAnonymousComments, setAllowAnonymousComments] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>("never");
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCreate() {
    setIsCreating(true);
    const result = await createShareLink({
      comparisonId,
      allowAnonymousComments,
      expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
    });
    setIsCreating(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Share link created");
    router.refresh();
  }

  async function handleCopy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleRevoke(id: string) {
    const result = await revokeShareLink(id, comparisonId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Share link revoked");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this comparison</DialogTitle>
          <DialogDescription>
            Anyone with the link can view it read-only, without signing in.
          </DialogDescription>
        </DialogHeader>

        {existingLinks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {existingLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link.url}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => handleCopy(link.url, link.id)}>
                  {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleRevoke(link.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-anon-comments"
              checked={allowAnonymousComments}
              onCheckedChange={(checked) => setAllowAnonymousComments(checked === true)}
            />
            <Label htmlFor="allow-anon-comments" className="text-sm font-normal">
              Allow anonymous comments
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Expires</Label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleCreate} disabled={isCreating}>
            Create link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
