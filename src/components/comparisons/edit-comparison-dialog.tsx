"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateComparison } from "@/lib/actions/comparisons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DesignSelect, ViewportSelect, type DesignOption } from "@/components/comparisons/comparison-fields";

type ComparisonValues = {
  name: string;
  designAssetId: string;
  /** Null for the older screenshot comparisons, which have no live URL or viewport. */
  live: { url: string; viewportWidth: number } | null;
};

export function EditComparisonDialog({
  comparisonId,
  current,
  designOptions,
  designPinCount,
  sitePinCount,
  open,
  onOpenChange,
}: {
  comparisonId: string;
  current: ComparisonValues;
  designOptions: DesignOption[];
  designPinCount: number;
  sitePinCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(current.name);
  const [designAssetId, setDesignAssetId] = useState(current.designAssetId);
  const [liveUrl, setLiveUrl] = useState(current.live?.url ?? "");
  const [viewportWidth, setViewportWidth] = useState(current.live?.viewportWidth ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const designChanged = designAssetId !== current.designAssetId;
  const viewportChanged = current.live !== null && viewportWidth !== current.live.viewportWidth;
  const canSubmit = name.trim() && designAssetId && (current.live === null || liveUrl.trim());

  // Opening always starts from what's saved, not from an abandoned edit.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(current.name);
      setDesignAssetId(current.designAssetId);
      setLiveUrl(current.live?.url ?? "");
      setViewportWidth(current.live?.viewportWidth ?? 0);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    const result = await updateComparison(comparisonId, {
      name,
      designAssetId,
      ...(current.live ? { liveUrl: liveUrl.trim(), viewportWidth } : {}),
    });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Comparison updated");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit comparison</DialogTitle>
          <DialogDescription>Pins and comments are kept.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-comparison-name">Name</Label>
            <Input id="edit-comparison-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Design</Label>
            <DesignSelect options={designOptions} value={designAssetId} onChange={setDesignAssetId} />
            {designChanged && designPinCount > 0 ? (
              <PinWarning>
                {pinCountLabel(designPinCount)} on the design will move to the new one, at the same
                position relative to its width. If its layout differs, they&rsquo;ll need dragging
                back into place.
              </PinWarning>
            ) : null}
          </div>

          {current.live ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-comparison-url">Live URL</Label>
                <Input
                  id="edit-comparison-url"
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="https://staging.example.com/pricing"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Viewport width</Label>
                <ViewportSelect value={viewportWidth} onChange={setViewportWidth} />
                {viewportChanged && sitePinCount > 0 ? (
                  <PinWarning>
                    {pinCountLabel(sitePinCount)} on the site will follow their elements as the page
                    reflows. Any whose element can&rsquo;t be found stay where they were.
                  </PinWarning>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PinWarning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{children}</p>
  );
}

function pinCountLabel(count: number): string {
  return count === 1 ? "The 1 pin" : `The ${count} pins`;
}
