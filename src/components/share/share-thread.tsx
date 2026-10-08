"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import { addAnonymousComment } from "@/lib/actions/share-links";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ThreadComment = { id: string; body: string; authorName: string; createdAt: string };
export type Thread = { id: string; number: number; status: string; comments: ThreadComment[] };

export function threadElementId(id: string): string {
  return `thread-${id}`;
}

export function ShareThread({
  thread,
  token,
  allowComments,
  selected,
  onSelect,
}: {
  thread: Thread;
  token: string;
  allowComments: boolean;
  selected: boolean;
  /** Shows this thread's pin. */
  onSelect: () => void;
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
    <div
      id={threadElementId(thread.id)}
      className={cn(
        "scroll-my-6 rounded-lg border border-border p-3",
        selected && "border-ring ring-1 ring-ring"
      )}
    >
      <button
        type="button"
        className="group mb-2 flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
          {thread.number}
        </span>
        <Badge variant="outline" className="capitalize">
          {thread.status.replace("_", " ")}
        </Badge>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Show pin
        </span>
      </button>

      <div className="flex flex-col gap-2">
        {thread.comments.map((comment) => (
          <div key={comment.id} className="text-sm">
            <span className="font-medium">{comment.authorName}</span>
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
