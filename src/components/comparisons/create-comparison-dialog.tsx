"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompare, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createComparison } from "@/lib/actions/comparisons";
import type { FigmaImportState } from "@/lib/figma/connection";
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
import { FigmaFrameField, type FigmaImport } from "@/components/assets/figma-frame-field";
import { DesignSelect, ViewportSelect, type DesignOption } from "@/components/comparisons/comparison-fields";

export function CreateComparisonDialog({
  projectSlug,
  pageId,
  designOptions,
  defaultUrl,
  figma = "disabled",
  trigger,
}: {
  projectSlug: string;
  pageId: string;
  designOptions: DesignOption[];
  defaultUrl: string;
  figma?: FigmaImportState;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(defaultNameFor(1440));
  const [nameEdited, setNameEdited] = useState(false);
  const [designAssetId, setDesignAssetId] = useState<string>("");
  const [liveUrl, setLiveUrl] = useState(defaultUrl);
  const [viewportWidth, setViewportWidth] = useState<number>(1440);
  // Whether the viewport was picked by hand rather than guessed from the
  // design, which a Figma import still rendering hasn't got a width for yet.
  const [viewportPicked, setViewportPicked] = useState(false);
  // A Figma import still rendering, which the design comes from once it's
  // done. Its outcome is only applied while it's still this one: picking
  // another design, or creating the comparison, takes it over.
  const [figmaImport, setFigmaImport] = useState<FigmaImport | null>(null);
  const figmaImportRef = useRef<FigmaImport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const canSubmit = name.trim() && (designAssetId || figmaImport) && liveUrl.trim();

  function trackFigmaImport(pending: FigmaImport | null) {
    figmaImportRef.current = pending;
    setFigmaImport(pending);
  }

  function handleDesignChange(id: string) {
    trackFigmaImport(null);
    setDesignAssetId(id);
    setViewportPicked(false);
    const design = designOptions.find((option) => option.id === id);
    applyViewport(guessViewportWidth(design?.width ?? null));
  }

  // A frame imported from here is picked straight away. It isn't among the
  // options until the refresh lands, so size the viewport from the import.
  async function handleFigmaImport(pending: FigmaImport) {
    trackFigmaImport(pending);
    setDesignAssetId("");
    setViewportPicked(false);
    const result = await pending;
    if (figmaImportRef.current !== pending) return;
    trackFigmaImport(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Frame imported from Figma");
    setDesignAssetId(result.data.id);
    applyViewport(guessViewportWidth(result.data.width));
    router.refresh();
  }

  // Until someone types a name, it follows the viewport ("Desktop — 1440px").
  function applyViewport(width: number) {
    setViewportWidth(width);
    if (!nameEdited) setName(defaultNameFor(width));
  }

  function resetForm() {
    setOpen(false);
    setName(defaultNameFor(1440));
    setNameEdited(false);
    setDesignAssetId("");
    setViewportPicked(false);
    trackFigmaImport(null);
  }

  async function handleSubmit() {
    if (figmaImport) {
      // Don't make people wait on Figma: close now and create the comparison
      // once the frame has rendered. The form's gone by then, so catch a bad
      // URL (the server's other check) while it can still be fixed.
      if (!isHttpUrl(liveUrl.trim())) {
        toast.error("Enter the site's full http(s) URL");
        return;
      }
      // Left null, the viewport and name follow the design as they would have.
      const input = {
        pageId,
        liveUrl: liveUrl.trim(),
        viewportWidth: viewportPicked ? viewportWidth : null,
        name: nameEdited ? name : null,
      };
      resetForm();
      void createOnceImported(figmaImport, input);
      return;
    }

    setIsSubmitting(true);
    const result = await submitComparison({
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
    resetForm();
    router.push(`/projects/${projectSlug}/${pageId}/compare/${result.data.id}`);
  }

  // Runs on after the dialog closes, and after its page is left, so it only
  // touches toasts and the router.
  async function createOnceImported(
    pending: FigmaImport,
    input: { pageId: string; liveUrl: string; viewportWidth: number | null; name: string | null }
  ) {
    const startedOn = window.location.pathname;
    const toastId = toast.loading("Rendering the design in Figma. The comparison opens when it’s ready.");
    // Leaving the app now would drop the comparison, so ask first.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);

    try {
      const imported = await pending;
      if (!imported.success) {
        toast.error(`Couldn’t import the design, so the comparison wasn’t created. ${imported.error}`, {
          id: toastId,
        });
        return;
      }

      const viewportWidth = input.viewportWidth ?? guessViewportWidth(imported.data.width);
      const result = await submitComparison({
        pageId: input.pageId,
        designAssetId: imported.data.id,
        liveUrl: input.liveUrl,
        viewportWidth,
        name: input.name ?? defaultNameFor(viewportWidth),
      });
      if (!result.success) {
        toast.error(`The design was imported, but the comparison wasn’t created. ${result.error}`, {
          id: toastId,
        });
        return;
      }

      const href = `/projects/${projectSlug}/${input.pageId}/compare/${result.data.id}`;
      // Only take people to it if they're still where they started; anywhere
      // else they've moved on, so offer it instead.
      if (window.location.pathname === startedOn) {
        toast.success("Comparison created", { id: toastId });
        router.push(href);
      } else {
        toast.success("Comparison created", {
          id: toastId,
          action: { label: "Open", onClick: () => router.push(href) },
        });
      }
    } finally {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    }
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
            {figmaImport ? (
              <p className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                Rendering the frame in Figma. You can create the comparison now; it opens once
                the design is ready.
              </p>
            ) : designOptions.length === 0 && !designAssetId ? (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                {figma === "connected"
                  ? "No designs yet. Import a Figma frame below, or upload one on this page."
                  : "No designs yet. Upload one on this page first, then come back here."}
              </p>
            ) : (
              <DesignSelect options={designOptions} value={designAssetId} onChange={handleDesignChange} />
            )}
            <FigmaFrameField figma={figma} pageId={pageId} onImport={handleFigmaImport} />
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
            <ViewportSelect
              value={viewportWidth}
              onChange={(width) => {
                setViewportPicked(true);
                applyViewport(width);
              }}
            />
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

// Expected failures come back as results, but an unexpected server error
// throws; without this the button would stay disabled with no message.
function submitComparison(input: {
  pageId: string;
  designAssetId: string;
  liveUrl: string;
  viewportWidth: number;
  name: string;
}) {
  return createComparison(input).catch(() => ({
    success: false as const,
    error: "Something went wrong creating the comparison. Try again.",
  }));
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function defaultNameFor(viewportWidth: number): string {
  const kind = viewportWidth < 600 ? "Mobile" : viewportWidth < 1024 ? "Tablet" : "Desktop";
  return `${kind} — ${viewportWidth}px`;
}
