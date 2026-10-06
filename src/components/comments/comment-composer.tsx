"use client";

import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type TeamMemberOption = { id: string; email: string };

export function CommentComposer({
  teamMembers,
  onSubmit,
  placeholder = "Reply… (@ to mention)",
  autoFocus = false,
}: {
  teamMembers: TeamMemberOption[];
  onSubmit: (body: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return teamMembers.filter((m) => m.email.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, teamMembers]);

  function updateMentionState(text: string, caret: number) {
    const upToCaret = text.slice(0, caret);
    const match = upToCaret.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(email: string) {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart;
    const upToCaret = value.slice(0, caret);
    const replaced = upToCaret.replace(/@([a-zA-Z0-9._-]*)$/, `@${email} `);
    const next = replaced + value.slice(caret);
    setValue(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setValue("");
      setMentionQuery(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-2">
      {mentionMatches.length > 0 ? (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {mentionMatches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={cn(
                "block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent",
                i === mentionIndex && "bg-accent"
              )}
              onClick={() => insertMention(m.email)}
            >
              {m.email}
            </button>
          ))}
        </div>
      ) : null}
      <Textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        onChange={(e) => {
          setValue(e.target.value);
          updateMentionState(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (mentionMatches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMentionIndex((i) => (i + 1) % mentionMatches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insertMention(mentionMatches[mentionIndex].email);
              return;
            }
            if (e.key === "Escape") {
              setMentionQuery(null);
              return;
            }
          }
          // Enter saves, like a chat; Shift+Enter starts a new line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Shift + Enter for a new line</span>
        <Button size="sm" onClick={handleSubmit} disabled={!value.trim() || isSubmitting}>
          <Check className="h-4 w-4" />
          Save
        </Button>
      </div>
    </div>
  );
}
