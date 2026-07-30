"use client";

import { useCallback, useEffect, useRef } from "react";

export type PanZoomState = {
  scale: number;
  tx: number;
  ty: number;
};

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const PIXELATED_THRESHOLD = 2; // "pixelated rendering above 200%"

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export type UsePanZoomOptions = {
  containerRef: React.RefObject<HTMLElement | null>;
  state: PanZoomState;
  onChange: (next: PanZoomState) => void;
  /** disable wheel/pointer handling (e.g. while a modal is open) */
  disabled?: boolean;
};

export type UsePanZoomResult = {
  screenToImage: (screenX: number, screenY: number) => { x: number; y: number };
  imageToScreen: (imageX: number, imageY: number) => { x: number; y: number };
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  fitToContainer: (imageWidth: number, imageHeight: number) => void;
  isPanning: boolean;
};

/**
 * Custom pan/zoom for a single image pane. Deliberately not a library —
 * screenToImage/imageToScreen are the primitives everything else (sync
 * lock, pin placement in Phase 6) builds on. `state` is controlled by the
 * caller so a parent can mirror it across panes for sync lock.
 */
export function usePanZoom({
  containerRef,
  state,
  onChange,
  disabled,
}: UsePanZoomOptions): UsePanZoomResult {
  const stateRef = useRef(state);
  stateRef.current = state;

  const isSpaceDownRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const screenToImage = useCallback((screenX: number, screenY: number) => {
    const s = stateRef.current;
    return { x: (screenX - s.tx) / s.scale, y: (screenY - s.ty) / s.scale };
  }, []);

  const imageToScreen = useCallback((imageX: number, imageY: number) => {
    const s = stateRef.current;
    return { x: s.tx + imageX * s.scale, y: s.ty + imageY * s.scale };
  }, []);

  const zoomAt = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      const s = stateRef.current;
      const nextScale = clampScale(s.scale * factor);
      if (nextScale === s.scale) return;
      const imagePoint = { x: (screenX - s.tx) / s.scale, y: (screenY - s.ty) / s.scale };
      onChange({
        scale: nextScale,
        tx: screenX - imagePoint.x * nextScale,
        ty: screenY - imagePoint.y * nextScale,
      });
    },
    [onChange]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const s = stateRef.current;
      onChange({ ...s, tx: s.tx + dx, ty: s.ty + dy });
    },
    [onChange]
  );

  const reset = useCallback(() => {
    onChange({ scale: 1, tx: 0, ty: 0 });
  }, [onChange]);

  const fitToContainer = useCallback(
    (imageWidth: number, imageHeight: number) => {
      const container = containerRef.current;
      if (!container || imageWidth <= 0 || imageHeight <= 0) return;
      const { width: cw, height: ch } = container.getBoundingClientRect();
      const scale = clampScale(Math.min(cw / imageWidth, ch / imageHeight));
      onChange({
        scale,
        tx: (cw - imageWidth * scale) / 2,
        ty: (ch - imageHeight * scale) / 2,
      });
    },
    [containerRef, onChange]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") isSpaceDownRef.current = true;
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") isSpaceDownRef.current = false;
    }

    function handlePointerDown(e: PointerEvent) {
      const isMiddle = e.button === 1;
      const isSpaceDrag = e.button === 0 && isSpaceDownRef.current;
      if (!isMiddle && !isSpaceDrag) return;
      e.preventDefault();
      isPanningRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      container!.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isPanningRef.current || !lastPointerRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      panBy(dx, dy);
    }

    function handlePointerUp(e: PointerEvent) {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      lastPointerRef.current = null;
      container!.releasePointerCapture(e.pointerId);
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [containerRef, disabled, zoomAt, panBy]);

  return {
    screenToImage,
    imageToScreen,
    zoomAt,
    panBy,
    reset,
    fitToContainer,
    isPanning: isPanningRef.current,
  };
}
