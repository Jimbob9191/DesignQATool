"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { importFigmaFrame } from "@/lib/actions/figma";
import type { ActionResult } from "@/lib/actions/result";
import type { FigmaImportState } from "@/lib/figma/connection";
import { parseFigmaLink } from "@/lib/figma/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FigmaImport = Promise<ActionResult<{ id: string; width: number }>>;

/**
 * Paste a Figma frame link and import it as a design asset. Shared by the
 * import dialog and the new-comparison dialog, which picks the new design
 * straight away. Renders nothing when Figma import isn't set up.
 *
 * Rendering can take a while, so onImport gets the import as soon as it
 * starts and handles how it ends (toasts included): the new-comparison
 * dialog can then close and let it finish in the background.
 */
export function FigmaFrameField({
  figma,
  pageId,
  onImport,
  autoFocus = false,
}: {
  figma: FigmaImportState;
  pageId: string | null;
  onImport: (pending: FigmaImport) => void;
  autoFocus?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  if (figma === "disabled") return null;
  if (figma === "disconnected") {
    return (
      <p className="text-sm text-muted-foreground">
        To use a Figma frame,{" "}
        <Link href="/settings#figma" className="font-medium text-primary hover:underline">
          connect Figma in Settings
        </Link>
        .
      </p>
    );
  }

  // Checked as you type, so a link to the whole file is caught before it
  // costs a round trip; the server parses it again regardless.
  const link = url.trim() ? parseFigmaLink(url) : null;

  async function handleImport() {
    if (!link?.success) return;
    // An unexpected server error throws rather than coming back as a result.
    const pending: FigmaImport = importFigmaFrame({ url, pageId }).catch(() => ({
      success: false as const,
      error: "Something went wrong importing from Figma. Try again.",
    }));
    onImport(pending);
    setIsImporting(true);
    const result = await pending;
    setIsImporting(false);
    if (result.success) setUrl("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          value={url}
          placeholder="Paste a Figma frame link"
          aria-label="Figma frame link"
          autoFocus={autoFocus}
          aria-invalid={link?.success === false}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // Enter imports rather than submitting whatever form this sits in.
            if (e.key === "Enter") {
              e.preventDefault();
              void handleImport();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleImport}
          disabled={!link?.success || isImporting}
        >
          {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isImporting ? "Rendering…" : "Import"}
        </Button>
      </div>
      {link?.success === false ? (
        <p className="text-sm text-destructive">{link.error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          In Figma, right-click a frame and choose Copy link to selection.
        </p>
      )}
    </div>
  );
}
