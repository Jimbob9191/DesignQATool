"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

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
}) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current[selectedId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-lg border border-border">
      <div className="border-b border-border px-3 py-2">
        <p className="text-sm font-medium">
          {threads.length} pin{threads.length === 1 ? "" : "s"}
        </p>
      </div>
      <ScrollArea className="h-[70vh]">
        {threads.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Click either image to drop a pin and start a thread.
          </p>
        ) : (
          threads.map((thread) => {
            const isSelected = thread.id === selectedId;
            const isCollapsed = (thread.status === "resolved" || thread.status === "wont_fix") && !isSelected;

            return (
              <div
                key={thread.id}
                ref={(el) => {
                  itemRefs.current[thread.id] = el;
                }}
                className={cn(
                  "cursor-pointer border-b border-border p-3",
                  isSelected && "bg-accent",
                  isCollapsed && "opacity-60"
                )}
                onClick={() => onSelect(thread.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
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
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABEL[thread.status]}
                    </span>
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

                {!isCollapsed ? (
                  <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                    {thread.comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        currentUserId={currentUserId}
                        onUpdated={(id, body) => onUpdateComment(thread.id, id, body)}
                        onDeleted={(id) => onDeleteComment(thread.id, id)}
                      />
                    ))}
                    <CommentComposer
                      teamMembers={teamMembers}
                      onSubmit={(body) => onAddComment(thread.id, body)}
                    />
                  </div>
                ) : (
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
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
