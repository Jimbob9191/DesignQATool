"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteTeam, renameTeam } from "@/lib/actions/teams";
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

export function RenameTeamForm({ teamName }: { teamName: string }) {
  const router = useRouter();
  const [name, setName] = useState(teamName);
  const [isPending, startTransition] = useTransition();
  const trimmed = name.trim();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameTeam({ name: trimmed });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Team renamed");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="team-name">Team name</Label>
      <div className="flex gap-2">
        <Input
          id="team-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          className="max-w-sm"
        />
        <Button type="submit" disabled={isPending || !trimmed || trimmed === teamName}>
          Save
        </Button>
      </div>
    </form>
  );
}

// Owner-only. Rather than the shared ConfirmDeleteDialog, this one makes the
// owner type the team's name, since it wipes every project in the team.
export function DeleteTeamButton({ teamName, canDelete }: { teamName: string; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await deleteTeam({ confirmName });
      // The dialog stays open on failure so the owner can retry.
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Team deleted");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (!next) setConfirmName("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={!canDelete}>
          Delete team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleDelete} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{teamName}&rdquo;?</DialogTitle>
            <DialogDescription>
              This permanently deletes the team and every project, page, asset, capture, and
              comment inside it, and removes everyone&rsquo;s access. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-team-name">
              Type <span className="font-semibold">{teamName}</span> to confirm
            </Label>
            <Input
              id="confirm-team-name"
              value={confirmName}
              autoComplete="off"
              onChange={(event) => setConfirmName(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || confirmName.trim() !== teamName}
            >
              {isPending ? "Deleting…" : "Delete team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
