"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, PanelRightClose, RotateCcw } from "lucide-react";

import type { AnnotationStatus } from "@/components/comparison/pin-marker";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommentComposer, type TeamMemberOption } from "@/components/comments/comment-composer";
import { CommentItem, type CommentData } from "@/components/comments/comment-item";

export type AnnotationThread = {
  id: string;
  number: number;
  target: "design" | "live";
  status: AnnotationStatus;
  authorEmail: string;
  /** Extra context, e.g. the pinned element's text on a live site. */
  detail?: string | null;
  comments: CommentData[];
};

const STATUS_LABEL: Record<AnnotationStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  needs_review: "Needs review",
};

const STATUS_DOT_CLASSES: Record<AnnotationStatus, string> = {
  open: "bg-status-open text-status-open-foreground",
  resolved: "bg-status-resolved text-status-resolved-foreground",
  wont_fix: "bg-status-wont-fix text-status-wont-fix-foreground",
  needs_review: "bg-status-needs-review text-status-needs-review-foreground",
};

export function CommentSidebar({
  threads,
  selectedId,
  onSelect,
  onStatusChange,
  teamMembers,
  currentUserId,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
}: {
  threads: AnnotationThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange?: (id: string, status: AnnotationStatus) => void;
  teamMembers: TeamMemberOption[];
  currentUserId: string;
  onAddComment: (annotationId: string, body: string) => Promise<void>;
  onUpdateComment: (annotationId: string, commentId: string, body: string) => void;
  onDeleteComment: (annotationId: string, commentId: string) => void;
  onClose?: () => void;
}) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // One editor open at a time: the selected pin's composer, or this comment's
  // edit box (which takes the composer's place until it's saved or cancelled).
  const [editing, setEditing] = useState<{ threadId: string; commentId: string } | null>(null);
  const editingCommentId = editing?.threadId === selectedId ? editing.commentId : null;

  // Moving to another pin abandons an edit.
  useEffect(() => {
    setEditing((prev) => (prev && prev.threadId === selectedId ? prev : null));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current[selectedId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div
      data-pan-zoom-ignore
      data-comment-panel="open"
      className="absolute inset-y-2 right-2 z-20 flex w-80 max-w-[calc(100%-1rem)] flex-col rounded-lg border border-border bg-background/85 shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-border py-1 pr-1 pl-3">
        <p className="text-sm font-medium">
          {threads.length} pin{threads.length === 1 ? "" : "s"}
        </p>
        {onClose ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Hide comments">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {threads.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Click either image to drop a pin and start a thread.
          </p>
        ) : (
          threads.map((thread) => {
            const isSelected = thread.id === selectedId;
            const isCollapsed = (thread.status === "resolved" || thread.status === "wont_fix") && !isSelected;
            const isNew = thread.comments.length === 0;

            return (
              <div
                key={thread.id}
                ref={(el) => {
                  itemRefs.current[thread.id] = el;
                }}
                className={cn(
                  "cursor-pointer border-b border-l-4 border-b-border border-l-transparent p-3",
                  isSelected && "border-l-primary bg-accent/80",
                  isCollapsed && "opacity-60"
                )}
                onClick={() => onSelect(thread.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        STATUS_DOT_CLASSES[thread.status]
                      )}
                    >
                      {thread.number}
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {thread.target}
                    </Badge>
                    {isNew && isSelected ? (
                      <span className="text-xs font-medium text-primary">New comment</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{STATUS_LABEL[thread.status]}</span>
                    )}
                  </div>
                  {onStatusChange ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(thread.id, thread.status === "resolved" ? "open" : "resolved");
                      }}
                      title={thread.status === "resolved" ? "Reopen" : "Resolve"}
                    >
                      {thread.status === "resolved" ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                </div>
                {thread.detail ? (
                  <p className="mt-1 truncate pl-7 text-xs text-muted-foreground" title={thread.detail}>
                    {thread.detail}
                  </p>
                ) : null}

                {!isCollapsed ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {thread.comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        currentUserId={currentUserId}
                        isEditing={editingCommentId === comment.id}
                        onEditingChange={(editing) => {
                          onSelect(thread.id);
                          setEditing(editing ? { threadId: thread.id, commentId: comment.id } : null);
                        }}
                        onUpdated={(id, body) => onUpdateComment(thread.id, id, body)}
                        onDeleted={(id) => onDeleteComment(thread.id, id)}
                      />
                    ))}
                    {isSelected && editingCommentId === null ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <CommentComposer
                          teamMembers={teamMembers}
                          placeholder={isNew ? "Add a comment… (@ to mention)" : undefined}
                          autoFocus={isNew}
                          onSubmit={(body) => onAddComment(thread.id, body)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 pl-7 text-xs text-muted-foreground">
                    {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}

/** Floating button that brings the comment panel back once it's hidden. */
export function ShowCommentsButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button
      data-pan-zoom-ignore
      data-comment-panel="closed"
      size="sm"
      variant="outline"
      className="absolute top-2 right-2 z-20 bg-background/85 text-foreground shadow-lg backdrop-blur-sm hover:bg-muted dark:border-border dark:bg-background/85 dark:hover:bg-muted"
      onClick={onClick}
      title="Show comments"
    >
      <MessageSquare className="h-4 w-4" />
      {count}
    </Button>
  );
}
