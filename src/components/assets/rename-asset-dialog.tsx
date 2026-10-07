"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { renameAsset } from "@/lib/actions/assets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RenameAssetDialog({
  assetId,
  currentName,
  trigger,
}: {
  assetId: string;
  currentName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 255 && trimmed !== currentName;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    const result = await renameAsset({ assetId, name: trimmed });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Asset renamed");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(currentName);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename asset</DialogTitle>
            <DialogDescription>
              The name shown in the asset library and the comparison design picker.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`asset-name-${assetId}`}>Name</Label>
            <Input
              id={`asset-name-${assetId}`}
              value={name}
              maxLength={255}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              // Select the name without its extension, so typing replaces
              // "homepage-v2" but keeps ".png".
              onFocus={(e) => {
                const dot = e.target.value.lastIndexOf(".");
                e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
              }}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
