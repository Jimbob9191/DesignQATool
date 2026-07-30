"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteProject } from "@/lib/actions/projects";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

type DeleteProjectButtonProps = {
  trigger: React.ReactNode;
  projectId: string;
  projectName: string;
  navigateToListOnDelete?: boolean;
};

export function DeleteProjectButton({
  trigger,
  projectId,
  projectName,
  navigateToListOnDelete,
}: DeleteProjectButtonProps) {
  const router = useRouter();

  return (
    <ConfirmDeleteDialog
      trigger={trigger}
      title={`Delete "${projectName}"?`}
      description="This permanently deletes the project and every page, asset, capture, and comment inside it. This can't be undone."
      onConfirm={async () => {
        await deleteProject(projectId);
        toast.success("Project deleted");
        if (navigateToListOnDelete) {
          router.push("/projects");
        } else {
          router.refresh();
        }
      }}
    />
  );
}
