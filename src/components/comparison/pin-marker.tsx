"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type AnnotationStatus = "open" | "resolved" | "wont_fix" | "needs_review";

const STATUS_CLASSES: Record<AnnotationStatus, string> = {
  open: "bg-status-open text-status-open-foreground border-status-open",
  resolved: "bg-status-resolved text-status-resolved-foreground border-status-resolved opacity-70",
  wont_fix: "bg-status-wont-fix text-status-wont-fix-foreground border-status-wont-fix opacity-70",
  needs_review:
    "bg-status-needs-review text-status-needs-review-foreground border-status-needs-review",
};

const DRAG_THRESHOLD_PX = 2;

export function PinMarker({
  number,
  status,
  screenX,
  screenY,
  scale,
  selected,
  detached = false,
  onSelect,
  onDragEnd,
}: {
  number: number;
  status: AnnotationStatus;
  screenX: number;
  screenY: number;
  scale: number;
  selected: boolean;
  /** A live-site pin whose element can't currently be found on the page. */
  detached?: boolean;
  onSelect: () => void;
  /** Omit to make the pin fixed (live-site pins follow their element instead). */
  onDragEnd?: (deltaImageX: number, deltaImageY: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onSelect();
    if (!onDragEnd) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a nice-to-have so drags keep tracking outside
      // the button's bounds; the drag itself still works without it
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragStart.current) return;
    e.stopPropagation();
    setDragOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragStart.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = null;
    setDragOffset(null);
    if (onDragEnd && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      onDragEnd(dx / scale, dy / scale);
    }
  }

  const left = screenX + (dragOffset?.x ?? 0);
  const top = screenY + (dragOffset?.y ?? 0);

  return (
    <button
      type="button"
      className={cn(
        "pointer-events-auto absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-semibold shadow-md",
        STATUS_CLASSES[status],
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        detached && "border-dashed opacity-60"
      )}
      title={detached ? "This element isn't on the page right now — showing where it was" : undefined}
      style={{ left, top }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
    >
      {number}
    </button>
  );
}
