"use client";

import { useState } from "react";
import { toast } from "sonner";

import { deleteComment, updateComment } from "@/lib/actions/comments";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type CommentData = {
  id: string;
  body: string;
  authorEmail: string;
  createdBy: string | null;
  createdAt: string;
  editedAt: string | null;
};

export function CommentItem({
  comment,
  currentUserId,
  onUpdated,
  onDeleted,
}: {
  comment: CommentData;
  currentUserId: string;
  onUpdated: (id: string, body: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const isOwn = comment.createdBy === currentUserId;

  async function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const result = await updateComment(comment.id, { body: trimmed });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onUpdated(comment.id, trimmed);
    setIsEditing(false);
  }

  async function handleDelete() {
    const result = await deleteComment(comment.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onDeleted(comment.id);
  }

  return (
    <div className="flex gap-2">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarFallback className="text-[10px]">
          {comment.authorEmail.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{comment.authorEmail}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString()}
            {comment.editedAt ? " (edited)" : ""}
          </span>
        </div>
        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
        )}
        {isOwn && !isEditing ? (
          <div className="flex gap-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive hover:underline"
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
