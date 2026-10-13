"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteAsset, setAssetPage } from "@/lib/actions/assets";
import { resyncFigmaAsset } from "@/lib/actions/figma";
import type { FigmaImportState } from "@/lib/figma/connection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { RenameAssetDialog } from "@/components/assets/rename-asset-dialog";
import { ExternalLink, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";

export type AssetCardData = {
  id: string;
  kind: "design" | "capture";
  /** From assetDisplayName(), so never empty. */
  name: string;
  width: number | null;
  height: number | null;
  pageId: string | null;
  signedUrl: string | null;
  /** Set for designs imported from Figma: the frame they were rendered from. */
  figmaUrl: string | null;
  // Comparisons built on this asset, which deleting it deletes too.
  comparisonNames: string[];
};

export type PageOption = { id: string; label: string };

const NAMED_COMPARISONS_LIMIT = 3;

function deleteDescription(comparisonNames: string[]): string {
  const base = "This permanently deletes the file.";
  const count = comparisonNames.length;
  if (count === 0) {
    return `${base} No comparisons use it. This can't be undone.`;
  }

  const quoted = comparisonNames.slice(0, NAMED_COMPARISONS_LIMIT).map((name) => `"${name}"`);
  const rest = count - quoted.length;
  const list =
    rest > 0
      ? `${quoted.join(", ")} and ${rest} more`
      : quoted.length > 1
        ? `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`
        : quoted[0];
  const noun = count === 1 ? "comparison" : "comparisons";
  return `${base} It's used by ${count} ${noun} (${list}), which will be deleted too, along with all of their pins and comments. This can't be undone.`;
}

export function AssetCard({
  asset,
  pageOptions,
  canEdit = true,
  figma = "disabled",
}: {
  asset: AssetCardData;
  pageOptions: PageOption[];
  canEdit?: boolean;
  /** The viewer's own Figma connection, which re-syncing uses. */
  figma?: FigmaImportState;
}) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleResync() {
    setIsSyncing(true);
    const result = await resyncFigmaAsset(asset.id);
    setIsSyncing(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.dimensionsChanged
        ? "Re-synced. The frame changed size, so pins on the design may have moved."
        : "Re-synced from Figma"
    );
    router.refresh();
  }

  async function handlePageChange(value: string) {
    const result = await setAssetPage(asset.id, value === "unassigned" ? null : value);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="overflow-hidden py-0">
      {/* overflow-hidden keeps a full-page design from stretching the box past its ratio; it's cropped to the top instead. */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
        {asset.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs; next/image's remote-pattern allowlist doesn't fit
          <img
            src={asset.signedUrl}
            alt={asset.name}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-muted-foreground">No preview</span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium" title={asset.name}>
            {asset.name}
          </p>
          <Badge variant="outline" className="shrink-0 capitalize">
            {asset.figmaUrl ? "Figma" : asset.kind}
          </Badge>
        </div>
        {asset.width && asset.height ? (
          <p className="text-xs text-muted-foreground">
            {asset.width}×{asset.height}
          </p>
        ) : null}

        <Select
          value={asset.pageId ?? "unassigned"}
          onValueChange={handlePageChange}
          disabled={!canEdit}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {pageOptions.map((page) => (
              <SelectItem key={page.id} value={page.id}>
                {page.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {asset.figmaUrl ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={asset.figmaUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            </Button>
            {canEdit && figma === "disconnected" ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings#figma" title="Connect your Figma account to re-sync this design">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Connect
                </Link>
              </Button>
            ) : null}
            {canEdit && figma === "connected" ? (
              <Button variant="outline" size="sm" onClick={handleResync} disabled={isSyncing}>
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Re-sync
              </Button>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          <div className="grid grid-cols-2 gap-2">
            <RenameAssetDialog
              assetId={asset.id}
              currentName={asset.name}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </Button>
              }
            />
            <ConfirmDeleteDialog
              trigger={
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              }
              title={`Delete "${asset.name}"?`}
              description={deleteDescription(asset.comparisonNames)}
              onConfirm={async () => {
                const result = await deleteAsset(asset.id);
                // Thrown errors are shown by the dialog, which stays open.
                if (!result.success) throw new Error(result.error);
                toast.success("Asset deleted");
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
