"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeletePageButton } from "@/components/pages/delete-page-button";
import { PageFormDialog } from "@/components/pages/page-form-dialog";

type PageRowActionsProps = {
  projectId: string;
  page: { id: string; name: string; path: string; description: string | null };
};

export function PageRowActions({ projectId, page }: PageRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Page actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <PageFormDialog
          projectId={projectId}
          page={page}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>Edit</DropdownMenuItem>
          }
        />
        <DeletePageButton
          projectId={projectId}
          pageId={page.id}
          pageName={page.name}
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
