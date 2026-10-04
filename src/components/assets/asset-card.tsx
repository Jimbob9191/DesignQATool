"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteAsset, setAssetPage } from "@/lib/actions/assets";
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
import { Trash2 } from "lucide-react";

export type AssetCardData = {
  id: string;
  kind: "design" | "capture";
  storagePath: string;
  width: number | null;
  height: number | null;
  pageId: string | null;
  signedUrl: string | null;
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
}: {
  asset: AssetCardData;
  pageOptions: PageOption[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const filename = asset.storagePath.split("/").pop() ?? asset.storagePath;

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
      <div className="flex aspect-square items-center justify-center bg-muted">
        {asset.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs; next/image's remote-pattern allowlist doesn't fit
          <img
            src={asset.signedUrl}
            alt={filename}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-muted-foreground">No preview</span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium" title={filename}>
            {filename}
          </p>
          <Badge variant="outline" className="shrink-0 capitalize">
            {asset.kind}
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

        {canEdit ? (
          <ConfirmDeleteDialog
            trigger={
              <Button variant="outline" size="sm" className="w-full text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            }
            title={`Delete "${filename}"?`}
            description={deleteDescription(asset.comparisonNames)}
            onConfirm={async () => {
              const result = await deleteAsset(asset.id);
              // Thrown errors are shown by the dialog, which stays open.
              if (!result.success) throw new Error(result.error);
              toast.success("Asset deleted");
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </Card>
  );
}
