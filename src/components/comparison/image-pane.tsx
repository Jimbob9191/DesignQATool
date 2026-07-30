"use client";

import { useEffect, useRef } from "react";

import { PIXELATED_THRESHOLD, usePanZoom, type PanZoomState } from "@/hooks/use-pan-zoom";
import { cn } from "@/lib/utils";

export type ImagePaneHandle = {
  fitToContainer: () => void;
  reset: () => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
};

export type PaneTransform = {
  imageToScreen: (imageX: number, imageY: number) => { x: number; y: number };
  screenToImage: (screenX: number, screenY: number) => { x: number; y: number };
  scale: number;
};

const CLICK_DRAG_THRESHOLD_PX = 4;

export function ImagePane({
  src,
  alt,
  imageWidth,
  imageHeight,
  state,
  onChange,
  onActivate,
  handleRef,
  onImageClick,
  onImageHover,
  overlay,
  className,
}: {
  src: string;
  alt: string;
  imageWidth: number;
  imageHeight: number;
  state: PanZoomState;
  onChange: (next: PanZoomState) => void;
  onActivate?: () => void;
  handleRef?: (handle: ImagePaneHandle) => void;
  /** Fires for a genuine click (not a pan drag) at the given image-space point. */
  onImageClick?: (point: { x: number; y: number }) => void;
  /** Fires on pointer move over the pane with the current image-space point, or null on leave. */
  onImageHover?: (point: { x: number; y: number } | null) => void;
  /** Renders pins/highlights in an unscaled screen-space layer above the image. */
  overlay?: (transform: PaneTransform) => React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitToContainer, reset, zoomAt, imageToScreen, screenToImage } = usePanZoom({
    containerRef,
    state,
    onChange,
  });
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    handleRef?.({
      fitToContainer: () => fitToContainer(imageWidth, imageHeight),
      reset,
      zoomAt,
    });
  }, [handleRef, fitToContainer, reset, zoomAt, imageWidth, imageHeight]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full touch-none overflow-hidden bg-muted", className)}
      onPointerEnter={onActivate}
      onPointerDown={(e) => {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        const down = pointerDownPos.current;
        if (down) {
          const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
          if (dist > CLICK_DRAG_THRESHOLD_PX) return;
        }
        if (!onImageClick || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        onImageClick(screenToImage(e.clientX - rect.left, e.clientY - rect.top));
      }}
      onPointerMove={(e) => {
        if (!onImageHover || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        onImageHover(screenToImage(e.clientX - rect.left, e.clientY - rect.top));
      }}
      onPointerLeave={() => onImageHover?.(null)}
    >
      <div
        style={{
          transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
          transformOrigin: "0 0",
          width: imageWidth,
          height: imageHeight,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary pan/zoom transform, not a layout image next/image can optimize */}
        <img
          src={src}
          alt={alt}
          width={imageWidth}
          height={imageHeight}
          draggable={false}
          style={{
            display: "block",
            imageRendering: state.scale > PIXELATED_THRESHOLD ? "pixelated" : "auto",
          }}
        />
      </div>
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {overlay({ imageToScreen, screenToImage, scale: state.scale })}
        </div>
      ) : null}
    </div>
  );
}
