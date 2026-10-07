"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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

type ConfirmDeleteDialogProps = {
  /** Omit to control the dialog with `open`/`onOpenChange`, e.g. from a menu item. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
};

export function ConfirmDeleteDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await onConfirm();
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
