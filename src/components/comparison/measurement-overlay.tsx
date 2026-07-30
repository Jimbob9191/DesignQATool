"use client";

import { useState } from "react";

type Point = { x: number; y: number };

/**
 * Click-drag pixel ruler. Distances are computed in image space (via
 * screenToImage) so the reading stays correct regardless of current zoom —
 * dragging at 400% zoom still reports the same pixel count as at 100%.
 */
export function MeasurementOverlay({
  containerRef,
  screenToImage,
  imageToScreen,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  screenToImage: (x: number, y: number) => Point;
  imageToScreen: (x: number, y: number) => Point;
}) {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);

  function toLocal(e: React.PointerEvent): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const point = toLocal(e);
    setStart(point);
    setEnd(point);
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setEnd(toLocal(e));
  }
  function handlePointerUp(e: React.PointerEvent) {
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const startImg = start ? screenToImage(start.x, start.y) : null;
  const endImg = end ? screenToImage(end.x, end.y) : null;
  const widthPx = startImg && endImg ? Math.round(Math.abs(endImg.x - startImg.x)) : 0;
  const heightPx = startImg && endImg ? Math.round(Math.abs(endImg.y - startImg.y)) : 0;
  const distancePx = startImg && endImg ? Math.round(Math.hypot(endImg.x - startImg.x, endImg.y - startImg.y)) : 0;

  const startScreen = startImg ? imageToScreen(startImg.x, startImg.y) : null;
  const endScreen = endImg ? imageToScreen(endImg.x, endImg.y) : null;

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {startScreen && endScreen ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <line
            x1={startScreen.x}
            y1={startScreen.y}
            x2={endScreen.x}
            y2={endScreen.y}
            stroke="var(--color-primary, #3b82f6)"
            strokeWidth={2}
          />
          <circle cx={startScreen.x} cy={startScreen.y} r={4} fill="var(--color-primary, #3b82f6)" />
          <circle cx={endScreen.x} cy={endScreen.y} r={4} fill="var(--color-primary, #3b82f6)" />
        </svg>
      ) : null}

      {startScreen && endScreen ? (
        <div
          className="pointer-events-none absolute rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm"
          style={{
            left: (startScreen.x + endScreen.x) / 2,
            top: (startScreen.y + endScreen.y) / 2 - 28,
            transform: "translateX(-50%)",
          }}
        >
          {distancePx}px ({widthPx}×{heightPx})
        </div>
      ) : (
        <div className="absolute top-2 left-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Click and drag to measure
        </div>
      )}
    </div>
  );
}
