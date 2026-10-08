"use client";

import { useState } from "react";
import { ChevronDown, Download, Pencil, Share2, Trash2 } from "lucide-react";

import { useExportPdf } from "@/hooks/use-export-pdf";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteComparisonDialog } from "@/components/comparisons/delete-comparison-dialog";
import { EditComparisonDialog } from "@/components/comparisons/edit-comparison-dialog";
import { ShareLinkDialog, type ShareLinkData } from "@/components/comparisons/share-link-dialog";

type EditProps = Omit<React.ComponentProps<typeof EditComparisonDialog>, "comparisonId" | "open" | "onOpenChange">;

export function ComparisonActionsMenu({
  comparisonId,
  comparisonName,
  projectSlug,
  pageId,
  canEdit,
  shareLinks,
  edit,
}: {
  comparisonId: string;
  comparisonName: string;
  projectSlug: string;
  pageId: string;
  /** Viewers can only export. */
  canEdit: boolean;
  shareLinks: ShareLinkData[];
  edit: EditProps;
}) {
  // The dialogs live outside the menu, which unmounts its items when it closes.
  const [openDialog, setOpenDialog] = useState<"share" | "edit" | "delete" | null>(null);
  const { exportPdf, isExporting } = useExportPdf(comparisonId, comparisonName);

  function dialogProps(dialog: NonNullable<typeof openDialog>) {
    return {
      open: openDialog === dialog,
      onOpenChange: (open: boolean) => setOpenDialog(open ? dialog : null),
    };
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* The trigger is the comparison's breadcrumb, so it carries the name. */}
          <Button variant="ghost" className="-ml-1 min-w-0 shrink" title="Comparison actions" aria-current="page">
            <span className="truncate">{comparisonName}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setOpenDialog("share")}>
              <Share2 />
              Share
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void exportPdf()} disabled={isExporting}>
            <Download />
            Export PDF
          </DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuItem onSelect={() => setOpenDialog("edit")}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setOpenDialog("delete")}>
                <Trash2 />
                Delete comparison
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEdit ? (
        <>
          <ShareLinkDialog comparisonId={comparisonId} existingLinks={shareLinks} {...dialogProps("share")} />
          <EditComparisonDialog comparisonId={comparisonId} {...edit} {...dialogProps("edit")} />
          <DeleteComparisonDialog
            projectSlug={projectSlug}
            pageId={pageId}
            comparisonId={comparisonId}
            comparisonName={comparisonName}
            {...dialogProps("delete")}
          />
        </>
      ) : null}
    </>
  );
}
