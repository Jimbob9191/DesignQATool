"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";

type ProjectRowActionsProps = {
  project: { id: string; name: string; slug: string; baseUrl: string | null };
};

export function ProjectRowActions({ project }: ProjectRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Project actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ProjectFormDialog
          project={project}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>Edit</DropdownMenuItem>
          }
        />
        <DeleteProjectButton
          projectId={project.id}
          projectName={project.name}
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
              Delete
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
