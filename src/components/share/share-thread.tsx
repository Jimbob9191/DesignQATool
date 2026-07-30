"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addAnonymousComment } from "@/lib/actions/share-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ThreadComment = { id: string; body: string; authorEmail: string; createdAt: string };
type Thread = { id: string; number: number; status: string; comments: ThreadComment[] };

export function ShareThread({
  thread,
  token,
  allowComments,
}: {
  thread: Thread;
  token: string;
  allowComments: boolean;
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    const result = await addAnonymousComment(token, { annotationId: thread.id, body, guestName });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setBody("");
    toast.success("Comment added");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
          {thread.number}
        </span>
        <Badge variant="outline" className="capitalize">
          {thread.status.replace("_", " ")}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {thread.comments.map((comment) => (
          <div key={comment.id} className="text-sm">
            <span className="font-medium">{comment.authorEmail}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(comment.createdAt).toLocaleString()}
            </span>
            <p className="text-muted-foreground">{comment.body}</p>
          </div>
        ))}
        {thread.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : null}
      </div>

      {allowComments ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <Input
            placeholder="Your name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <Textarea
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
          />
          <Button
            size="sm"
            className="self-end"
            disabled={isSubmitting || !body.trim() || !guestName.trim()}
            onClick={handleSubmit}
          >
            Reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
