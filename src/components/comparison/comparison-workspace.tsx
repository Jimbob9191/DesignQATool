"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createAnnotation, updateAnnotationPosition, updateAnnotationStatus } from "@/lib/actions/annotations";
import { createComment } from "@/lib/actions/comments";
import { setComparisonViaProxy } from "@/lib/actions/comparisons";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { FORMER_MEMBER, guestAuthor } from "@/lib/authors";
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
import { LiveComparisonViewer } from "@/components/comparison/live-comparison-viewer";
import type { LivePick } from "@/components/comparison/live-pane";
import type { AnnotationStatus } from "@/components/comparison/pin-marker";
import { samePage, type Rect } from "@/lib/live/protocol";

type WorkspaceAnnotation = {
  id: string;
  target: "design" | "live";
  xRatio: number;
  yPx: number;
  status: AnnotationStatus;
  number: number;
  authorId: string | null;
  authorEmail: string;
  elementSelector: string | null;
  elementRect: Rect | null;
  elementText: string | null;
  pageUrl: string | null;
  comments: CommentData[];
};

/**
 * What the design is compared against: a screenshot taken by the old
 * capture service, or the site itself framed live at a viewport width.
 */
export type WorkspaceLiveSide =
  | {
      kind: "capture";
      image: ComparisonImage;
      captureAssetId: string;
      elementMap: ElementMapEntry[];
    }
  | {
      kind: "site";
      url: string;
      viewportWidth: number;
      snippet: string;
      proxyOrigin: string | null;
      viaProxy: boolean;
    };

export function ComparisonWorkspace({
  comparisonId,
  design,
  live,
  designAssetId,
  initialAnnotations,
  currentUser,
  teamMembers,
  canModerate = true,
  initialSelectedId = null,
}: {
  comparisonId: string;
  design: ComparisonImage;
  live: WorkspaceLiveSide;
  designAssetId: string;
  initialAnnotations: WorkspaceAnnotation[];
  currentUser: { id: string; email: string };
  teamMembers: TeamMemberOption[];
  canModerate?: boolean;
  // Pin to open on load, e.g. when arriving from a search result.
  initialSelectedId?: string | null;
}) {
  const [annotations, setAnnotations] = useState<WorkspaceAnnotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [viaProxy, setViaProxy] = useState(live.kind === "site" && live.viaProxy);

  async function handleViaProxyChange(next: boolean) {
    setViaProxy(next);
    const result = await setComparisonViaProxy(comparisonId, next);
    if (!result.success) {
      toast.error(result.error);
      setViaProxy(!next);
    }
  }

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  const memberEmails = useMemo(() => new Map(teamMembers.map((m) => [m.id, m.email])), [teamMembers]);

  // Realtime rows carry only ids, so resolve the author the same way the
  // server render does. Someone who joined the team after this page loaded
  // isn't in teamMembers yet, hence the generic fallback.
  function authorLabel(createdBy: string | null, guestName: string | null = null): string {
    if (createdBy) return memberEmails.get(createdBy) ?? (createdBy === currentUser.id ? currentUser.email : "Teammate");
    return guestName ? guestAuthor(guestName) : FORMER_MEMBER;
  }

  const { presentUsers } = useComparisonRealtime({
    comparisonId,
    annotationIds: annotations.map((a) => a.id),
    currentUser,
    onAnnotationChange: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new;
        setAnnotations((prev) => {
          // Dedupe by id only, so your own pins from another tab still appear.
          // This tab's pins are reconciled when createAnnotation returns.
          if (prev.some((a) => a.id === row.id)) return prev;
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
              authorEmail: authorLabel(row.created_by),
              elementSelector: row.element_selector,
              elementRect: row.element_rect,
              elementText: row.element_text,
              pageUrl: row.page_url,
              comments: [],
            },
          ];
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new;
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === row.id
              ? {
                  ...a,
                  xRatio: Number(row.x_ratio),
                  yPx: row.y_px,
                  status: row.status,
                  elementSelector: row.element_selector,
                  elementRect: row.element_rect,
                }
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
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === row.annotation_id && !a.comments.some((c) => c.id === row.id)
              ? {
                  ...a,
                  comments: [
                    ...a.comments,
                    {
                      id: row.id,
                      body: row.body,
                      createdBy: row.created_by,
                      authorEmail: authorLabel(row.created_by, row.guest_name),
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

  type NewAnnotation = Pick<
    WorkspaceAnnotation,
    "target" | "xRatio" | "yPx" | "elementSelector" | "elementRect" | "elementText" | "pageUrl"
  > & { assetId: string | null };

  async function addAnnotation(input: NewAnnotation) {
    const nextNumber = annotations.length > 0 ? Math.max(...annotations.map((a) => a.number)) + 1 : 1;
    const tempId = `pending-${Date.now()}`;
    const { assetId, ...fields } = input;
    setAnnotations((prev) => [
      ...prev,
      {
        ...fields,
        id: tempId,
        status: "open",
        number: nextNumber,
        authorId: currentUser.id,
        authorEmail: currentUser.email,
        comments: [],
      },
    ]);
    setSelectedId(tempId);

    const result = await createAnnotation({ ...fields, comparisonId, assetId });

    if (!result.success) {
      toast.error(result.error);
      setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      setSelectedId(null);
      return;
    }

    // The realtime INSERT can beat the action's response, in which case a copy
    // under the real id is already in state. Keep the optimistic one, which
    // has the right number, and drop that copy.
    const realId = result.data.id;
    setAnnotations((prev) =>
      prev.filter((a) => a.id !== realId).map((a) => (a.id === tempId ? { ...a, id: realId } : a))
    );
    setSelectedId(realId);
  }

  function handleCreate(
    target: "design" | "live",
    point: { x: number; y: number },
    hit: { selector: string; rect: ElementMapEntry["rect"] } | null
  ) {
    const image = target === "design" || live.kind !== "capture" ? design : live.image;
    void addAnnotation({
      target,
      assetId: target === "design" ? designAssetId : live.kind === "capture" ? live.captureAssetId : null,
      xRatio: point.x / image.width,
      yPx: point.y,
      elementSelector: hit?.selector ?? null,
      elementRect: hit?.rect ?? null,
      elementText: null,
      pageUrl: null,
    });
  }

  function handleCreateLive(pick: LivePick, viewportWidth: number) {
    void addAnnotation({
      target: "live",
      assetId: null,
      xRatio: Math.min(1, Math.max(0, pick.docPoint.x / viewportWidth)),
      yPx: Math.max(0, pick.docPoint.y),
      elementSelector: pick.element.selector || null,
      elementRect: pick.element.docRect,
      elementText: pick.element.text || null,
      pageUrl: pick.url,
    });
  }

  async function handleDrag(id: string, next: { xRatio: number; yPx: number }) {
    const before = annotations.find((a) => a.id === id);
    if (!before) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, xRatio: next.xRatio, yPx: next.yPx, status: "open" } : a))
    );
    const result = await updateAnnotationPosition(id, next);
    if (!result.success) {
      toast.error(result.error);
      const { xRatio, yPx, status } = before;
      setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, xRatio, yPx, status } : a)));
    }
  }

  async function handleStatusChange(id: string, status: AnnotationStatus) {
    const before = annotations.find((a) => a.id === id);
    if (!before) return;
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    const result = await updateAnnotationStatus(id, status);
    if (!result.success) {
      toast.error(result.error);
      setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, status: before.status } : a)));
    }
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
    // As with pins, the realtime INSERT may already have added this comment.
    const realId = result.data.id;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === annotationId
          ? {
              ...a,
              comments: a.comments
                .filter((c) => c.id !== realId)
                .map((c) => (c.id === tempId ? { ...c, id: realId } : c)),
            }
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
      detail: live.kind === "site" ? livePinDetail(a, live.url) : null,
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
          {live.kind === "capture" ? (
            <ComparisonViewer
              design={design}
              live={live.image}
              annotations={annotations}
              selectedAnnotationId={selectedId}
              onSelectAnnotation={setSelectedId}
              onCreateAnnotation={handleCreate}
              onDragAnnotation={canModerate ? handleDrag : undefined}
              elementMap={live.elementMap}
            />
          ) : (
            <LiveComparisonViewer
              design={design}
              site={{
                url: live.url,
                viewportWidth: live.viewportWidth,
                label: "Live",
                proxyOrigin: live.proxyOrigin,
                viaProxy,
              }}
              snippet={live.snippet}
              annotations={annotations}
              selectedAnnotationId={selectedId}
              onSelectAnnotation={setSelectedId}
              onCreateDesignAnnotation={(point) => handleCreate("design", point, null)}
              onCreateLiveAnnotation={(pick) => handleCreateLive(pick, live.viewportWidth)}
              onDragAnnotation={canModerate ? handleDrag : undefined}
              onViaProxyChange={canModerate ? handleViaProxyChange : undefined}
            />
          )}
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

/** Sidebar hint for a live-site pin: the element's text, and its page if not the comparison's own. */
function livePinDetail(annotation: WorkspaceAnnotation, comparisonUrl: string): string | null {
  if (annotation.target !== "live") return null;
  const parts: string[] = [];
  if (annotation.elementText) parts.push(`“${annotation.elementText}”`);
  if (annotation.pageUrl && !samePage(annotation.pageUrl, comparisonUrl)) {
    try {
      const url = new URL(annotation.pageUrl);
      parts.push(`on ${url.pathname}${url.search}`);
    } catch {
      parts.push(`on ${annotation.pageUrl}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
