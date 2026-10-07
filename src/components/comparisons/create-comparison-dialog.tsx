"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompare } from "lucide-react";
import { toast } from "sonner";

import { createComparison } from "@/lib/actions/comparisons";
import { guessViewportWidth } from "@/lib/live/viewports";
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
import { DesignSelect, ViewportSelect, type DesignOption } from "@/components/comparisons/comparison-fields";

export function CreateComparisonDialog({
  projectSlug,
  pageId,
  designOptions,
  defaultUrl,
  trigger,
}: {
  projectSlug: string;
  pageId: string;
  designOptions: DesignOption[];
  defaultUrl: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(defaultNameFor(1440));
  const [nameEdited, setNameEdited] = useState(false);
  const [designAssetId, setDesignAssetId] = useState<string>("");
  const [liveUrl, setLiveUrl] = useState(defaultUrl);
  const [viewportWidth, setViewportWidth] = useState<number>(1440);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const canSubmit = name.trim() && designAssetId && liveUrl.trim();

  function handleDesignChange(id: string) {
    setDesignAssetId(id);
    const design = designOptions.find((option) => option.id === id);
    handleViewportChange(guessViewportWidth(design?.width ?? null));
  }

  // Until someone types a name, it follows the viewport ("Desktop — 1440px").
  function handleViewportChange(width: number) {
    setViewportWidth(width);
    if (!nameEdited) setName(defaultNameFor(width));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    const result = await createComparison({
      pageId,
      designAssetId,
      liveUrl: liveUrl.trim(),
      viewportWidth,
      name,
    });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Comparison created");
    setOpen(false);
    setName(defaultNameFor(1440));
    setNameEdited(false);
    setDesignAssetId("");
    router.push(`/projects/${projectSlug}/${pageId}/compare/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New comparison</DialogTitle>
          <DialogDescription>
            Put a design next to the live site, rendered at the width the design was made for.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comparison-name">Name</Label>
            <Input
              id="comparison-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              placeholder="Desktop — v2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Design</Label>
            {designOptions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                No designs yet — upload one on this page first, then come back here.
              </p>
            ) : (
              <DesignSelect options={designOptions} value={designAssetId} onChange={handleDesignChange} />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comparison-url">Live URL</Label>
            <Input
              id="comparison-url"
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="https://staging.example.com/pricing"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Viewport width</Label>
            <ViewportSelect value={viewportWidth} onChange={handleViewportChange} />
            <p className="text-xs text-muted-foreground">
              Picked from the design&rsquo;s width (allowing for @2x/@3x exports).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            <GitCompare className="h-4 w-4" />
            Create comparison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultNameFor(viewportWidth: number): string {
  const kind = viewportWidth < 600 ? "Mobile" : viewportWidth < 1024 ? "Tablet" : "Desktop";
  return `${kind} — ${viewportWidth}px`;
}
