"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { checkFigmaAsset, resyncFigmaAsset } from "@/lib/actions/figma";
import type { FigmaImportState } from "@/lib/figma/connection";
import { Button } from "@/components/ui/button";

/**
 * For a design imported from Figma: a link back to the frame, and a re-sync
 * button that's marked once the Figma file has changed since the render.
 * Everyone on the team sees the link. Re-syncing and the change check both
 * use the viewer's own Figma token, never the importer's, so a teammate who
 * hasn't connected Figma is pointed at Settings instead.
 */
export function FigmaSyncButton({
  assetId,
  figmaUrl,
  canEdit,
  figma,
}: {
  assetId: string;
  figmaUrl: string;
  canEdit: boolean;
  figma: FigmaImportState;
}) {
  const canResync = canEdit && figma === "connected";
  const [outdated, setOutdated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  // After the page has loaded rather than during render, so a slow Figma
  // never holds up the comparison.
  useEffect(() => {
    if (!canResync) return;
    let cancelled = false;
    void checkFigmaAsset(assetId).then((result) => {
      if (!cancelled && result.success) setOutdated(result.data.outdated === true);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, canResync]);

  async function handleResync() {
    setIsSyncing(true);
    const result = await resyncFigmaAsset(assetId);
    setIsSyncing(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setOutdated(false);
    if (result.data.dimensionsChanged) {
      toast.warning("Re-synced. The frame changed size, so pins on the design may have moved.");
    } else {
      toast.success("Re-synced from Figma");
    }
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild>
        <a href={figmaUrl} target="_blank" rel="noreferrer" aria-label="Open design in Figma" title="Open design in Figma">
          <ExternalLink className="h-4 w-4" />
          <span className="hidden lg:inline">Figma</span>
        </a>
      </Button>
      {canEdit && figma === "disconnected" ? (
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/settings#figma"
            aria-label="Connect Figma to re-sync this design"
            title="Connect your Figma account to re-sync this design"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden lg:inline">Connect to re-sync</span>
          </Link>
        </Button>
      ) : null}
      {canResync ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleResync}
          disabled={isSyncing}
          className="relative"
          aria-label={outdated ? "Re-sync design from Figma (the file has changed)" : "Re-sync design from Figma"}
          title={outdated ? "The Figma file has changed since this was rendered" : "Re-render the design from Figma"}
        >
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="hidden lg:inline">Re-sync</span>
          {outdated && !isSyncing ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </Button>
      ) : null}
    </>
  );
}
