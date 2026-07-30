"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deletePage } from "@/lib/actions/pages";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

type DeletePageButtonProps = {
  trigger: React.ReactNode;
  projectId: string;
  pageId: string;
  pageName: string;
};

export function DeletePageButton({ trigger, projectId, pageId, pageName }: DeletePageButtonProps) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={trigger}
      title={`Delete "${pageName}"?`}
      description="This permanently deletes the page and every asset, capture, comparison, and comment inside it. This can't be undone."
      onConfirm={async () => {
        await deletePage(projectId, pageId);
        toast.success("Page deleted");
        router.refresh();
      }}
    />
  );
}
