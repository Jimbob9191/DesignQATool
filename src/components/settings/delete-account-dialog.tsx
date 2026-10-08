"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { deleteAccount } from "@/lib/actions/account";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccountDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      // Success redirects to /login, so only a failure ever comes back.
      const result = await deleteAccount(typed);
      if (result && !result.success) setError(result.error);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&rsquo;t be undone. Teams where you&rsquo;re the only member are deleted with
            all their projects and files. In shared teams, your comments and uploads stay and show
            as &ldquo;Former member&rdquo;.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed && !isPending) handleConfirm();
          }}
        >
          <Label htmlFor="delete-account-email" className="block leading-normal font-normal">
            Type <span className="font-medium break-all">{email}</span> to confirm.
          </Label>
          <Input
            id="delete-account-email"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open so a refusal can be shown in it.
              event.preventDefault();
              if (confirmed && !isPending) handleConfirm();
            }}
            disabled={!confirmed || isPending}
            variant="destructive"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
