"use client";

import { useEffect, useRef, useState } from "react";

import type { PanZoomState } from "@/hooks/use-pan-zoom";

type Point = { x: number; y: number };

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/**
 * Samples pixel color from the rendered image via an off-screen canvas — a
 * raw <img> doesn't expose pixel data. Requires crossOrigin="anonymous" on
 * the source image and permissive CORS from the host (Supabase Storage's
 * signed URLs allow this), or the canvas is "tainted" and getImageData
 * throws a SecurityError. Verified live against real signed URLs rather
 * than assumed — see Phase 10 notes.
 */
export function EyedropperTool({
  containerRef,
  imageSrc,
  imageWidth,
  imageHeight,
  viewState,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  viewState: PanZoomState;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ screen: Point; hex: string } | null>(null);
  const [pinned, setPinned] = useState<{ hex: string; rgb: string } | null>(null);

  useEffect(() => {
    setReady(false);
    setError(null);
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
      canvasRef.current = canvas;
      setReady(true);
    };
    img.onerror = () => setError("Couldn't load image for color sampling.");
    img.src = imageSrc;
  }, [imageSrc, imageWidth, imageHeight]);

  function sampleAt(imageX: number, imageY: number): { hex: string; rgb: string } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const x = Math.floor(imageX);
    const y = Math.floor(imageY);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    try {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, rgb: `rgb(${r}, ${g}, ${b})` };
    } catch {
      setError("Color sampling is blocked by CORS for this image.");
      return null;
    }
  }

  function toLocalAndImage(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const image = {
      x: (screen.x - viewState.tx) / viewState.scale,
      y: (screen.y - viewState.ty) / viewState.scale,
    };
    return { screen, image };
  }

  function handleMove(e: React.PointerEvent) {
    if (!ready) return;
    const { screen, image } = toLocalAndImage(e);
    const sample = sampleAt(image.x, image.y);
    setCursor(sample ? { screen, hex: sample.hex } : null);
  }

  async function handleClick(e: React.MouseEvent) {
    if (!ready) return;
    const { image } = toLocalAndImage(e);
    const sample = sampleAt(image.x, image.y);
    if (!sample) return;
    setPinned(sample);
    try {
      await navigator.clipboard.writeText(sample.hex);
    } catch {
      // clipboard access can fail silently (permissions) — the picked value
      // is still shown on screen either way.
    }
  }

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      onPointerMove={handleMove}
      onPointerLeave={() => setCursor(null)}
      onClick={handleClick}
    >
      {error ? (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-destructive/90 px-2 py-1 text-xs text-white shadow-sm">
          {error}
        </div>
      ) : !ready ? (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Loading pixel data…
        </div>
      ) : (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Click to pick a color (copies hex)
        </div>
      )}

      {cursor ? (
        <div
          className="pointer-events-none absolute flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm"
          style={{ left: cursor.screen.x + 12, top: cursor.screen.y + 12 }}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: cursor.hex }}
          />
          {cursor.hex}
        </div>
      ) : null}

      {pinned ? (
        <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs shadow-sm">
          <span className="h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: pinned.hex }} />
          <div className="flex flex-col">
            <span className="font-medium">{pinned.hex}</span>
            <span className="text-muted-foreground">{pinned.rgb}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
