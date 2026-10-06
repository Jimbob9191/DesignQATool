"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteComparison } from "@/lib/actions/comparisons";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

export function DeleteComparisonButton({
  trigger,
  projectSlug,
  pageId,
  comparisonId,
  comparisonName,
}: {
  trigger: React.ReactNode;
  projectSlug: string;
  pageId: string;
  comparisonId: string;
  comparisonName: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={trigger}
      title={`Delete "${comparisonName}"?`}
      description="This removes the comparison. The underlying design and capture assets are kept."
      onConfirm={async () => {
        const result = await deleteComparison(pageId, comparisonId);
        // Thrown errors are shown by the dialog, which stays open.
        if (!result.success) throw new Error(result.error);
        toast.success("Comparison deleted");
        router.push(`/projects/${projectSlug}/${pageId}`);
      }}
    />
  );
}
