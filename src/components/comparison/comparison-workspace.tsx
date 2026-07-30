"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createAnnotation, updateAnnotationPosition, updateAnnotationStatus } from "@/lib/actions/annotations";
import { createComment } from "@/lib/actions/comments";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { useComparisonRealtime } from "@/lib/realtime/use-comparison-realtime";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnnotationThread, CommentSidebar } from "@/components/comments/comment-sidebar";
import type { TeamMemberOption } from "@/components/comments/comment-composer";
import type { CommentData } from "@/components/comments/comment-item";
import {
  ComparisonViewer,
  type ComparisonImage,
} from "@/components/comparison/comparison-viewer";
import type { AnnotationStatus } from "@/components/comparison/pin-marker";

type WorkspaceAnnotation = {
  id: string;
  target: "design" | "live";
  xRatio: number;
  yPx: number;
  status: AnnotationStatus;
  number: number;
  authorId: string;
  authorEmail: string;
  comments: CommentData[];
};

export function ComparisonWorkspace({
  comparisonId,
  design,
  live,
  designAssetId,
  captureAssetId,
  initialAnnotations,
  elementMap,
  currentUser,
  teamMembers,
  canModerate = true,
}: {
  comparisonId: string;
  design: ComparisonImage;
  live: ComparisonImage;
  designAssetId: string;
  captureAssetId: string;
  initialAnnotations: WorkspaceAnnotation[];
  elementMap: ElementMapEntry[];
  currentUser: { id: string; email: string };
  teamMembers: TeamMemberOption[];
  canModerate?: boolean;
}) {
  const [annotations, setAnnotations] = useState<WorkspaceAnnotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  const { presentUsers } = useComparisonRealtime({
    comparisonId,
    annotationIds: annotations.map((a) => a.id),
    currentUser,
    onAnnotationChange: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new;
        setAnnotations((prev) => {
          if (prev.some((a) => a.id === row.id) || row.created_by === currentUser.id) return prev;
          const nextNumber = prev.length > 0 ? Math.max(...prev.map((a) => a.number)) + 1 : 1;
          return [
            ...prev,
            {
              id: row.id,
              target: row.target,
              xRatio: Number(row.x_ratio),
              yPx: row.y_px,
              status: row.status,
              number: nextNumber,
              authorId: row.created_by,
              authorEmail: "teammate",
              comments: [],
            },
          ];
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new;
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === row.id
              ? { ...a, xRatio: Number(row.x_ratio), yPx: row.y_px, status: row.status }
              : a
          )
        );
      } else if (payload.eventType === "DELETE") {
        const row = payload.old;
        if (row?.id) setAnnotations((prev) => prev.filter((a) => a.id !== row.id));
      }
    },
    onCommentChange: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new;
        if (row.created_by === currentUser.id) return; // already applied optimistically
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === row.annotation_id
              ? {
                  ...a,
                  comments: [
                    ...a.comments,
                    {
                      id: row.id,
                      body: row.body,
                      createdBy: row.created_by,
                      authorEmail: "teammate",
                      createdAt: row.created_at,
                      editedAt: row.edited_at,
                    },
                  ],
                }
              : a
          )
        );
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new;
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === row.annotation_id
              ? {
                  ...a,
                  comments: a.comments.map((c) =>
                    c.id === row.id ? { ...c, body: row.body, editedAt: row.edited_at } : c
                  ),
                }
              : a
          )
        );
      } else if (payload.eventType === "DELETE") {
        const row = payload.old;
        if (!row?.id) return;
        setAnnotations((prev) =>
          prev.map((a) => ({ ...a, comments: a.comments.filter((c) => c.id !== row.id) }))
        );
      }
    },
  });

  async function handleCreate(
    target: "design" | "live",
    point: { x: number; y: number },
    hit: { selector: string; rect: ElementMapEntry["rect"] } | null
  ) {
    const image = target === "design" ? design : live;
    const xRatio = point.x / image.width;
    const yPx = point.y;

    const nextNumber = annotations.length > 0 ? Math.max(...annotations.map((a) => a.number)) + 1 : 1;
    const tempId = `pending-${Date.now()}`;
    setAnnotations((prev) => [
      ...prev,
      {
        id: tempId,
        target,
        xRatio,
        yPx,
        status: "open",
        number: nextNumber,
        authorId: currentUser.id,
        authorEmail: currentUser.email,
        comments: [],
      },
    ]);
    setSelectedId(tempId);

    const result = await createAnnotation({
      comparisonId,
      target,
      assetId: target === "design" ? designAssetId : captureAssetId,
      xRatio,
      yPx,
      elementSelector: hit?.selector ?? null,
      elementRect: hit?.rect ?? null,
    });

    if (!result.success) {
      toast.error(result.error);
      setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      setSelectedId(null);
      return;
    }

    setAnnotations((prev) => prev.map((a) => (a.id === tempId ? { ...a, id: result.data.id } : a)));
    setSelectedId(result.data.id);
  }

  async function handleDrag(id: string, next: { xRatio: number; yPx: number }) {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, xRatio: next.xRatio, yPx: next.yPx, status: "open" } : a))
    );
    const result = await updateAnnotationPosition(id, next);
    if (!result.success) toast.error(result.error);
  }

  async function handleStatusChange(id: string, status: AnnotationStatus) {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    const result = await updateAnnotationStatus(id, status);
    if (!result.success) toast.error(result.error);
  }

  async function handleAddComment(annotationId: string, body: string) {
    const tempId = `pending-${Date.now()}`;
    const optimistic: CommentData = {
      id: tempId,
      body,
      createdBy: currentUser.id,
      authorEmail: currentUser.email,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };
    setAnnotations((prev) =>
      prev.map((a) => (a.id === annotationId ? { ...a, comments: [...a.comments, optimistic] } : a))
    );

    const result = await createComment({ annotationId, body });
    if (!result.success) {
      toast.error(result.error);
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === annotationId ? { ...a, comments: a.comments.filter((c) => c.id !== tempId) } : a
        )
      );
      return;
    }
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === annotationId
          ? { ...a, comments: a.comments.map((c) => (c.id === tempId ? { ...c, id: result.data.id } : c)) }
          : a
      )
    );
  }

  function handleUpdateComment(annotationId: string, commentId: string, body: string) {
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === annotationId
          ? {
              ...a,
              comments: a.comments.map((c) =>
                c.id === commentId ? { ...c, body, editedAt: new Date().toISOString() } : c
              ),
            }
          : a
      )
    );
  }

  function handleDeleteComment(annotationId: string, commentId: string) {
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === annotationId
          ? { ...a, comments: a.comments.filter((c) => c.id !== commentId) }
          : a
      )
    );
  }

  const threads: AnnotationThread[] = annotations
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((a) => ({
      id: a.id,
      number: a.number,
      target: a.target,
      status: a.status,
      authorEmail: a.authorEmail,
      comments: a.comments,
    }));

  return (
    <div className="flex flex-col gap-3">
      {presentUsers.length > 1 ? (
        <div className="flex items-center gap-1 self-end">
          <span className="text-xs text-muted-foreground">Also viewing:</span>
          <div className="flex -space-x-2">
            {presentUsers
              .filter((u) => u.userId !== currentUser.id)
              .map((u) => (
                <Tooltip key={u.userId}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6 border-2 border-background">
                      <AvatarFallback className="text-[10px]">
                        {u.email.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{u.email}</TooltipContent>
                </Tooltip>
              ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <ComparisonViewer
            design={design}
            live={live}
            annotations={annotations}
            selectedAnnotationId={selectedId}
            onSelectAnnotation={setSelectedId}
            onCreateAnnotation={handleCreate}
            onDragAnnotation={canModerate ? handleDrag : undefined}
            elementMap={elementMap}
          />
        </div>
        <CommentSidebar
          threads={threads}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStatusChange={canModerate ? handleStatusChange : undefined}
          teamMembers={teamMembers}
          currentUserId={currentUser.id}
          onAddComment={handleAddComment}
          onUpdateComment={handleUpdateComment}
          onDeleteComment={handleDeleteComment}
        />
      </div>
    </div>
  );
}
