"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { FigmaImportState } from "@/lib/figma/connection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FigmaFrameField } from "@/components/assets/figma-frame-field";

export function ImportFigmaDialog({
  figma,
  defaultPageId = null,
  trigger,
}: {
  figma: FigmaImportState;
  defaultPageId?: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from Figma</DialogTitle>
          <DialogDescription>
            The frame is rendered at 2x and stays linked to Figma, so you can re-sync it when the
            design changes.
          </DialogDescription>
        </DialogHeader>
        <FigmaFrameField
          figma={figma}
          pageId={defaultPageId}
          autoFocus
          onImport={async (pending) => {
            const result = await pending;
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            toast.success("Frame imported from Figma");
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
