"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteAsset, setAssetPage, setAssetProject } from "@/lib/actions/assets";
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
  projectId: string | null;
  signedUrl: string | null;
};

export type PageOption = { id: string; label: string };
export type ProjectOption = { id: string; label: string };

export function AssetCard({
  asset,
  pageOptions,
  projectOptions,
  canEdit = true,
}: {
  asset: AssetCardData;
  pageOptions: PageOption[];
  // Only supplied where the wider scope is meaningful (the team-wide asset
  // library). On a page's own grid there is nothing to choose between, so the
  // project select is left off entirely.
  projectOptions?: ProjectOption[];
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

  // Picking a project deliberately drops any page assignment (setAssetProject
  // clears it), which is why the two selects can never end up describing
  // different projects.
  async function handleProjectChange(value: string) {
    const result = await setAssetProject(asset.id, value === "unassigned" ? null : value);
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

        {projectOptions ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Project</span>
            <Select
              value={asset.projectId ?? "unassigned"}
              onValueChange={handleProjectChange}
              disabled={!canEdit}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          {projectOptions ? <span className="text-xs text-muted-foreground">Page</span> : null}
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
        </div>

        {canEdit ? (
          <ConfirmDeleteDialog
            trigger={
              <Button variant="outline" size="sm" className="w-full text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            }
            title={`Delete "${filename}"?`}
            description="This permanently removes the file from storage and any pins referencing it. This can't be undone."
            onConfirm={async () => {
              await deleteAsset(asset.id);
              toast.success("Asset deleted");
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </Card>
  );
}
