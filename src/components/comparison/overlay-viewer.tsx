"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Blend, Crosshair, Ruler, Wand2 } from "lucide-react";

import { PIXELATED_THRESHOLD, usePanZoom, type PanZoomState } from "@/hooks/use-pan-zoom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { EyedropperTool } from "@/components/comparison/eyedropper-tool";
import { MeasurementOverlay } from "@/components/comparison/measurement-overlay";
import type { ComparisonImage } from "@/components/comparison/comparison-viewer";

export type OverlayMode = "overlay" | "swipe";
type ActiveTool = "none" | "measure" | "eyedropper";

const INITIAL_VIEW: PanZoomState = { scale: 1, tx: 0, ty: 0 };
const FLASH_INTERVAL_MS = 450;

export function OverlayViewer({
  mode,
  design,
  live,
  commentPanel,
}: {
  mode: OverlayMode;
  design: ComparisonImage;
  live: ComparisonImage;
  commentPanel?: React.ReactNode;
}) {
  const [view, setView] = useState<PanZoomState>(INITIAL_VIEW);
  const [alignScale, setAlignScale] = useState(1);
  const [manualScale, setManualScale] = useState(1);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const [opacity, setOpacity] = useState(50);
  const [blendDifference, setBlendDifference] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [flashOn, setFlashOn] = useState(true);
  const [dividerPercent, setDividerPercent] = useState(50);
  const [activeTool, setActiveTool] = useState<ActiveTool>("none");

  const containerRef = useRef<HTMLDivElement>(null);
  const isNudging = useRef<{ x: number; y: number } | null>(null);
  const isDraggingDivider = useRef(false);

  const { fitToContainer, imageToScreen, screenToImage } = usePanZoom({
    containerRef,
    state: view,
    onChange: setView,
    disabled: activeTool !== "none",
  });

  useEffect(() => {
    fitToContainer(live.width, live.height);
  }, [fitToContainer, live.width, live.height, live.src]);

  const handleAutoAlign = useCallback(() => {
    setAlignScale(live.width / design.width);
    setManualScale(1);
    setOffset({ dx: 0, dy: 0 });
  }, [live.width, design.width]);

  // Auto-align by default whenever the image pair changes, so overlay/swipe
  // opens already lined up — manual nudge/scale still layers on top of this.
  useEffect(() => {
    handleAutoAlign();
  }, [handleAutoAlign]);

  useEffect(() => {
    if (!flashing) {
      setFlashOn(true);
      return;
    }
    const id = setInterval(() => setFlashOn((v) => !v), FLASH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flashing]);

  const designScale = view.scale * alignScale * manualScale;
  const designTx = view.tx + offset.dx * view.scale;
  const designTy = view.ty + offset.dy * view.scale;

  function handleDesignPointerDown(e: React.PointerEvent) {
    if (mode !== "overlay" || activeTool !== "none") return;
    isNudging.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handleDesignPointerMove(e: React.PointerEvent) {
    const start = isNudging.current;
    if (!start) return;
    const dxScreen = e.clientX - start.x;
    const dyScreen = e.clientY - start.y;
    isNudging.current = { x: e.clientX, y: e.clientY };
    setOffset((prev) => ({
      dx: prev.dx + dxScreen / view.scale,
      dy: prev.dy + dyScreen / view.scale,
    }));
  }
  function handleDesignPointerUp(e: React.PointerEvent) {
    isNudging.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function handleDividerPointerDown(e: React.PointerEvent) {
    isDraggingDivider.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handleDividerPointerMove(e: React.PointerEvent) {
    if (!isDraggingDivider.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    setDividerPercent(Math.min(100, Math.max(0, percent)));
  }
  function handleDividerPointerUp(e: React.PointerEvent) {
    isDraggingDivider.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const designLayer = (
    <div
      onPointerDown={handleDesignPointerDown}
      onPointerMove={handleDesignPointerMove}
      onPointerUp={handleDesignPointerUp}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: design.width,
        height: design.height,
        transform: `translate(${designTx}px, ${designTy}px) scale(${designScale})`,
        transformOrigin: "0 0",
        opacity: mode === "overlay" ? (flashing ? (flashOn ? 1 : 0) : opacity / 100) : 1,
        mixBlendMode: mode === "overlay" && blendDifference ? "difference" : "normal",
        cursor: mode === "overlay" && activeTool === "none" ? "move" : undefined,
        clipPath:
          mode === "swipe"
            ? `inset(0 0 0 ${(dividerPercent / 100) * (live.width / (design.width * designScale)) * design.width}px)`
            : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary pan/zoom transform */}
      <img
        src={design.src}
        alt={design.label}
        width={design.width}
        height={design.height}
        draggable={false}
        crossOrigin="anonymous"
        style={{
          display: "block",
          imageRendering: view.scale > PIXELATED_THRESHOLD ? "pixelated" : "auto",
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        {mode === "overlay" ? (
          <>
            <div className="flex min-w-40 items-center gap-2">
              <Label className="text-xs text-muted-foreground">Opacity</Label>
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={0}
                max={100}
                step={1}
                disabled={flashing}
                className="w-24"
              />
              <span className="w-9 text-xs text-muted-foreground">{opacity}%</span>
            </div>
            <Button
              variant={blendDifference ? "secondary" : "outline"}
              size="sm"
              onClick={() => setBlendDifference((v) => !v)}
            >
              <Blend className="h-4 w-4" />
              Difference
            </Button>
            <Button variant={flashing ? "secondary" : "outline"} size="sm" onClick={() => setFlashing((v) => !v)}>
              Flash
            </Button>
          </>
        ) : null}

        <Button variant="outline" size="sm" onClick={handleAutoAlign}>
          <Wand2 className="h-4 w-4" />
          Auto-align
        </Button>

        <div className="flex min-w-32 items-center gap-2">
          <Label className="text-xs text-muted-foreground">Scale</Label>
          <Slider
            value={[manualScale]}
            onValueChange={([v]) => setManualScale(v)}
            min={0.5}
            max={2}
            step={0.01}
            className="w-24"
          />
          <span className="w-10 text-xs text-muted-foreground">{Math.round(manualScale * 100)}%</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={activeTool === "measure" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setActiveTool((t) => (t === "measure" ? "none" : "measure"))}
          >
            <Ruler className="h-4 w-4" />
            Measure
          </Button>
          <Button
            variant={activeTool === "eyedropper" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setActiveTool((t) => (t === "eyedropper" ? "none" : "eyedropper"))}
          >
            <Crosshair className="h-4 w-4" />
            Eyedropper
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[70vh] touch-none overflow-hidden rounded-lg border border-border bg-muted"
        style={{ isolation: "isolate" }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: live.width,
            height: live.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary pan/zoom transform */}
          <img
            src={live.src}
            alt={live.label}
            width={live.width}
            height={live.height}
            draggable={false}
            crossOrigin="anonymous"
            style={{
              display: "block",
              imageRendering: view.scale > PIXELATED_THRESHOLD ? "pixelated" : "auto",
            }}
          />
        </div>

        {designLayer}

        {mode === "swipe" ? (
          <div
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
            className="absolute top-0 bottom-0 w-1 -translate-x-1/2 cursor-col-resize touch-none bg-primary"
            style={{ left: `${dividerPercent}%` }}
          >
            <div className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background" />
          </div>
        ) : null}

        {activeTool === "measure" ? (
          <MeasurementOverlay
            containerRef={containerRef}
            screenToImage={screenToImage}
            imageToScreen={imageToScreen}
          />
        ) : null}
        {activeTool === "eyedropper" ? (
          <EyedropperTool
            containerRef={containerRef}
            imageSrc={live.src}
            imageWidth={live.width}
            imageHeight={live.height}
            viewState={view}
          />
        ) : null}
        {commentPanel}
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "overlay"
          ? "Drag the design layer to nudge it. Scroll to zoom, space/middle-drag to pan."
          : "Drag the divider to compare. Scroll to zoom, space/middle-drag to pan."}
      </p>
    </div>
  );
}
