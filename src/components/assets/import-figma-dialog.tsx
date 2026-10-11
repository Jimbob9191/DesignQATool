"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { importFigmaFrame } from "@/lib/actions/figma";
import { parseFigmaLink } from "@/lib/figma/links";
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

export function ImportFigmaDialog({
  connected,
  defaultPageId = null,
  trigger,
}: {
  connected: boolean;
  defaultPageId?: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Checked as you type, so a link to the whole file is caught before it
  // costs a round trip; the server parses it again regardless.
  const link = url.trim() ? parseFigmaLink(url) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!link?.success) return;

    setIsSubmitting(true);
    const result = await importFigmaFrame({ url, pageId: defaultPageId });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Frame imported from Figma");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-import would hide the result, so wait it out.
        if (isSubmitting) return;
        setOpen(next);
        if (next) setUrl("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {connected ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Import from Figma</DialogTitle>
              <DialogDescription>
                In Figma, right-click a frame and choose Copy link to selection, then paste it
                here. It&rsquo;s rendered at 2x and stays linked, so you can re-sync it when the
                design changes.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="figma-frame-url">Frame link</Label>
              <Input
                id="figma-frame-url"
                value={url}
                placeholder="https://www.figma.com/design/…?node-id=…"
                autoFocus
                aria-invalid={link?.success === false}
                onChange={(e) => setUrl(e.target.value)}
              />
              {link?.success === false ? (
                <p className="text-sm text-destructive">{link.error}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!link?.success || isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Rendering…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Connect Figma first</DialogTitle>
              <DialogDescription>
                Add a Figma personal access token in Settings, then come back and paste a link to
                any frame you can open in Figma.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild>
                <Link href="/settings#figma">Go to Settings</Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
