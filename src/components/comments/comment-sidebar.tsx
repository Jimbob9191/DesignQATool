"use client";

import { useEffect, useRef, useState } from "react";
import { ListFilter, MessageSquare, MoreHorizontal, PanelRightClose, Trash2, X } from "lucide-react";

import {
  activePinFilterCount,
  NO_PIN_FILTERS,
  type PinFilters,
} from "@/components/comparison/pin-filters";
import type { AnnotationStatus } from "@/components/comparison/pin-marker";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
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
  /** Whether the current user may delete this pin (see deleteAnnotation). */
  canDelete: boolean;
  comments: CommentData[];
};

const STATUS_LABEL: Record<AnnotationStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  needs_review: "Needs review",
};

const STATUSES = Object.keys(STATUS_LABEL) as AnnotationStatus[];

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
  onDelete,
  teamMembers,
  currentUserId,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  totalCount,
  filters,
  onFiltersChange,
  authorOptions,
}: {
  threads: AnnotationThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange?: (id: string, status: AnnotationStatus) => void;
  onDelete?: (id: string) => void;
  teamMembers: TeamMemberOption[];
  currentUserId: string;
  onAddComment: (annotationId: string, body: string) => Promise<void>;
  onUpdateComment: (annotationId: string, commentId: string, body: string) => void;
  onDeleteComment: (annotationId: string, commentId: string) => void;
  onClose?: () => void;
  /** Pins before filtering. */
  totalCount: number;
  filters: PinFilters;
  onFiltersChange: (filters: PinFilters) => void;
  /** Everyone who has dropped a pin, to filter by. */
  authorOptions: string[];
}) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // One editor open at a time: the selected pin's composer, or this comment's
  // edit box (which takes the composer's place until it's saved or cancelled).
  const [editing, setEditing] = useState<{ threadId: string; commentId: string } | null>(null);
  const editingCommentId = editing?.threadId === selectedId ? editing.commentId : null;
  // The pin awaiting delete confirmation. The dialog lives outside the menu so
  // it survives the menu closing, and outside the threads so its clicks don't
  // select one. The pin is kept after closing so the text doesn't blank out
  // while the dialog animates away.
  const [confirmingDelete, setConfirmingDelete] = useState<AnnotationThread | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isFiltered = activePinFilterCount(filters) > 0;

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
      {/* Icon buttons pull into the padding so their icons line up with the threads' menus. */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">
          {isFiltered ? `${threads.length} of ` : null}
          {totalCount} pin{totalCount === 1 ? "" : "s"}
        </p>
        <PinFilterMenu filters={filters} onFiltersChange={onFiltersChange} authorOptions={authorOptions} />
        {onClose ? (
          <Button size="icon" variant="ghost" className="-mr-1.5 h-7 w-7" onClick={onClose} title="Hide comments">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {threads.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {isFiltered ? "No pins match these filters." : "Click either image to drop a pin and start a thread."}
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
                  {/* Menu clicks bubble through the portal to the thread, so stop them here. */}
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    {onStatusChange || (onDelete && thread.canDelete) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="-my-1 -mr-1.5 h-7 w-7" title="More actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {onStatusChange ? (
                            <>
                              <DropdownMenuLabel>Status</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={thread.status}
                                onValueChange={(value) => onStatusChange(thread.id, value as AnnotationStatus)}
                              >
                                {STATUSES.map((status) => (
                                  <DropdownMenuRadioItem key={status} value={status}>
                                    {STATUS_LABEL[status]}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </>
                          ) : null}
                          {onDelete && thread.canDelete ? (
                            <>
                              {onStatusChange ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuItem variant="destructive" onSelect={() => {
                                  setConfirmingDelete(thread);
                                  setConfirmDeleteOpen(true);
                                }}>
                                <Trash2 />
                                Delete pin
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
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
      {onDelete ? (
        <ConfirmDeleteDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={`Delete pin ${confirmingDelete?.number ?? ""}?`}
          description={
            confirmingDelete && confirmingDelete.comments.length > 0
              ? `This also deletes its ${confirmingDelete.comments.length} comment${confirmingDelete.comments.length === 1 ? "" : "s"}. This can't be undone.`
              : "This can't be undone."
          }
          onConfirm={async () => {
            if (confirmingDelete) onDelete(confirmingDelete.id);
          }}
        />
      ) : null}
    </div>
  );
}

/** Floating button that brings the comment panel back once it's hidden. */
export function ShowCommentsButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={onClick}
      title="Show comments"
    >
      <MessageSquare className="h-4 w-4" />
      {count}
    </Button>
  );
}

/** Every pin filter in one menu, so the panel header stays a single line. */
function PinFilterMenu({
  filters,
  onFiltersChange,
  authorOptions,
}: {
  filters: PinFilters;
  onFiltersChange: (filters: PinFilters) => void;
  authorOptions: string[];
}) {
  const activeCount = activePinFilterCount(filters);

  // Picking an option leaves the menu open, so several filters can be set in one go.
  function keepOpen(event: Event) {
    event.preventDefault();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={activeCount > 0 ? "secondary" : "ghost"}
          className="ml-auto h-7 gap-1 px-2 text-xs"
        >
          <ListFilter className="h-3.5 w-3.5" />
          Filter
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.status}
          onValueChange={(status) => onFiltersChange({ ...filters, status: status as PinFilters["status"] })}
        >
          <DropdownMenuRadioItem value="all" onSelect={keepOpen}>
            All statuses
          </DropdownMenuRadioItem>
          {STATUSES.map((status) => (
            <DropdownMenuRadioItem key={status} value={status} onSelect={keepOpen}>
              {STATUS_LABEL[status]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Pinned on</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.target}
          onValueChange={(target) => onFiltersChange({ ...filters, target: target as PinFilters["target"] })}
        >
          <DropdownMenuRadioItem value="all" onSelect={keepOpen}>
            Design and live
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="design" onSelect={keepOpen}>
            Design
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="live" onSelect={keepOpen}>
            Live
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {authorOptions.length > 1 || filters.author !== "all" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Author</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={filters.author}
              onValueChange={(author) => onFiltersChange({ ...filters, author })}
            >
              <DropdownMenuRadioItem value="all" onSelect={keepOpen}>
                Anyone
              </DropdownMenuRadioItem>
              {authorOptions.map((email) => (
                <DropdownMenuRadioItem key={email} value={email} onSelect={keepOpen}>
                  <span className="truncate">{email}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        {activeCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onFiltersChange(NO_PIN_FILTERS)}>
              <X />
              Clear filters
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
