"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";

import type { PanZoomState } from "@/hooks/use-pan-zoom";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { hitTestElementMap } from "@/lib/annotations/hit-test";
import { denormalizeView, normalizeView } from "@/lib/comparison/sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ElementHoverHighlight } from "@/components/comparison/element-hover-highlight";
import { LayoutTabs, SyncToggle, type Layout } from "@/components/comparison/layout-tabs";
import { matchesPinFilters, NO_PIN_FILTERS, type PinFilters } from "@/components/comparison/pin-filters";
import { ImagePane, type ImagePaneHandle, type PaneTransform } from "@/components/comparison/image-pane";
import { OverlayViewer } from "@/components/comparison/overlay-viewer";
import { PinMarker, type AnnotationStatus } from "@/components/comparison/pin-marker";

export type ComparisonImage = {
  src: string;
  width: number;
  height: number;
  label: string;
};

export type AnnotationData = {
  id: string;
  target: "design" | "live";
  xRatio: number;
  yPx: number;
  status: AnnotationStatus;
  number: number;
  authorEmail: string;
};

type PaneId = "design" | "live";

const INITIAL_VIEW: PanZoomState = { scale: 1, tx: 0, ty: 0 };

export function ComparisonViewer({
  design,
  live,
  annotations = [],
  selectedAnnotationId = null,
  filters = NO_PIN_FILTERS,
  onSelectAnnotation,
  onCreateAnnotation,
  onDragAnnotation,
  elementMap,
  commentPanel,
}: {
  design: ComparisonImage;
  live: ComparisonImage;
  annotations?: AnnotationData[];
  selectedAnnotationId?: string | null;
  /** Set from the comment panel. */
  filters?: PinFilters;
  onSelectAnnotation?: (id: string) => void;
  onCreateAnnotation?: (
    target: PaneId,
    point: { x: number; y: number },
    hit: { selector: string; rect: ElementMapEntry["rect"] } | null
  ) => void;
  onDragAnnotation?: (id: string, next: { xRatio: number; yPx: number }) => void;
  elementMap?: ElementMapEntry[];
  /** Floated over the right edge of the canvas. */
  commentPanel?: React.ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>("side-by-side");
  const [singlePane, setSinglePane] = useState<PaneId>("design");
  const [syncLocked, setSyncLocked] = useState(true);
  const [splitPercent, setSplitPercent] = useState(50);
  const [activePane, setActivePane] = useState<PaneId>("design");
  const [designView, setDesignView] = useState<PanZoomState>(INITIAL_VIEW);
  const [liveView, setLiveView] = useState<PanZoomState>(INITIAL_VIEW);
  const [hoveredRect, setHoveredRect] = useState<ElementMapEntry["rect"] | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const designHandle = useRef<ImagePaneHandle | null>(null);
  const liveHandle = useRef<ImagePaneHandle | null>(null);
  const isDraggingSplitter = useRef(false);

  const handleDesignChange = useCallback(
    (next: PanZoomState) => {
      setDesignView(next);
      if (syncLocked) {
        setLiveView(denormalizeView(normalizeView(next, design.width), live.width));
      }
    },
    [syncLocked, design.width, live.width]
  );

  const handleLiveChange = useCallback(
    (next: PanZoomState) => {
      setLiveView(next);
      if (syncLocked) {
        setDesignView(denormalizeView(normalizeView(next, live.width), design.width));
      }
    },
    [syncLocked, design.width, live.width]
  );

  useEffect(() => {
    designHandle.current?.fitToContainer();
    liveHandle.current?.fitToContainer();
  }, [design.src, live.src]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      designHandle.current?.fitToContainer();
      liveHandle.current?.fitToContainer();
    });
    return () => cancelAnimationFrame(id);
  }, [layout, singlePane, splitPercent]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      const activeHandle = activePane === "design" ? designHandle.current : liveHandle.current;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const rect = rootRef.current?.getBoundingClientRect();
        activeHandle?.zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, 1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        const rect = rootRef.current?.getBoundingClientRect();
        activeHandle?.zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, 1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        activeHandle?.reset();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        activeHandle?.fitToContainer();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSyncLocked((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePane]);

  function handleSplitterPointerDown(e: React.PointerEvent) {
    isDraggingSplitter.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handleSplitterPointerMove(e: React.PointerEvent) {
    if (!isDraggingSplitter.current || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const percent =
      layout === "side-by-side"
        ? ((e.clientX - rect.left) / rect.width) * 100
        : ((e.clientY - rect.top) / rect.height) * 100;
    setSplitPercent(Math.min(90, Math.max(10, percent)));
  }
  function handleSplitterPointerUp(e: React.PointerEvent) {
    isDraggingSplitter.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const visibleAnnotations = useMemo(
    () =>
      // The pin you're on stays, so it doesn't vanish as you change its status.
      annotations.filter((a) => a.id === selectedAnnotationId || matchesPinFilters(a, filters)),
    [annotations, filters, selectedAnnotationId]
  );

  function handlePaneClick(target: PaneId, point: { x: number; y: number }) {
    if (!onCreateAnnotation) return;
    // Fit-to-container centers the image and can letterbox it within the
    // pane — a click can land in that empty margin, outside the image
    // itself. There's no content there to pin, so ignore it.
    const image = target === "design" ? design : live;
    if (point.x < 0 || point.x > image.width || point.y < 0 || point.y > image.height) return;

    if (target === "live" && elementMap) {
      const hit = hitTestElementMap(elementMap, point);
      onCreateAnnotation(target, point, hit ? { selector: hit.selector, rect: hit.rect } : null);
    } else {
      onCreateAnnotation(target, point, null);
    }
  }

  function handlePaneHover(target: PaneId, point: { x: number; y: number } | null) {
    if (target !== "live" || !elementMap) return;
    if (!point) {
      setHoveredRect(null);
      return;
    }
    setHoveredRect(hitTestElementMap(elementMap, point)?.rect ?? null);
  }

  function renderPins(target: PaneId, image: ComparisonImage, transform: PaneTransform) {
    return (
      <>
        {visibleAnnotations
          .filter((a) => a.target === target)
          .map((a) => {
            const screen = transform.imageToScreen(a.xRatio * image.width, a.yPx);
            return (
              <PinMarker
                key={a.id}
                number={a.number}
                status={a.status}
                screenX={screen.x}
                screenY={screen.y}
                scale={transform.scale}
                selected={a.id === selectedAnnotationId}
                onSelect={() => onSelectAnnotation?.(a.id)}
                onDragEnd={(dx, dy) => {
                  if (!onDragAnnotation) return;
                  const currentImageX = a.xRatio * image.width;
                  const currentImageY = a.yPx;
                  onDragAnnotation(a.id, {
                    xRatio: (currentImageX + dx) / image.width,
                    yPx: currentImageY + dy,
                  });
                }}
              />
            );
          })}
        {target === "live" && hoveredRect ? (
          <ElementHoverHighlight
            rect={hoveredRect}
            imageToScreen={transform.imageToScreen}
            scale={transform.scale}
          />
        ) : null}
      </>
    );
  }

  const zoomPercent = Math.round((activePane === "design" ? designView.scale : liveView.scale) * 100);

  const designPane = (
    <ImagePane
      src={design.src}
      alt={design.label}
      imageWidth={design.width}
      imageHeight={design.height}
      state={designView}
      onChange={handleDesignChange}
      onActivate={() => setActivePane("design")}
      handleRef={(h) => (designHandle.current = h)}
      onImageClick={(pt) => handlePaneClick("design", pt)}
      overlay={(transform) => renderPins("design", design, transform)}
    />
  );

  const livePane = (
    <ImagePane
      src={live.src}
      alt={live.label}
      imageWidth={live.width}
      imageHeight={live.height}
      state={liveView}
      onChange={handleLiveChange}
      onActivate={() => setActivePane("live")}
      handleRef={(h) => (liveHandle.current = h)}
      onImageClick={(pt) => handlePaneClick("live", pt)}
      onImageHover={(pt) => handlePaneHover("live", pt)}
      overlay={(transform) => renderPins("live", live, transform)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same gutter as the top bar, and the same height while it fits on one line. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <LayoutTabs value={layout} onValueChange={setLayout} />

        {layout !== "overlay" && layout !== "swipe" ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {layout === "single" ? (
              <Tabs value={singlePane} onValueChange={(v) => setSinglePane(v as PaneId)}>
                <TabsList>
                  <TabsTrigger value="design">{design.label}</TabsTrigger>
                  <TabsTrigger value="live">{live.label}</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            <span className="w-12 text-center text-sm text-muted-foreground" title="Zoom">
              {zoomPercent}%
            </span>
            <SyncToggle synced={syncLocked} onSyncedChange={setSyncLocked} />
          </div>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 text-muted-foreground", (layout === "overlay" || layout === "swipe") && "ml-auto")}
              aria-label="How to use this view"
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="flex-col items-start gap-1">
            {layout === "overlay" ? (
              <p>Drag the design layer to nudge it.</p>
            ) : layout === "swipe" ? (
              <p>Drag the divider to compare.</p>
            ) : (
              <>
                <p>Click either image to pin a comment.</p>
                <p>Shortcuts: +/- zoom, 0 reset, F fit, S sync.</p>
              </>
            )}
            <p>Scroll to zoom. Hold space or middle-drag to pan.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {layout === "overlay" || layout === "swipe" ? (
        <OverlayViewer mode={layout} design={design} live={live} commentPanel={commentPanel} />
      ) : (
        <>
          <div
            ref={rootRef}
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              layout === "side-by-side" && "flex flex-row",
              layout === "stacked" && "flex flex-col"
            )}
          >
            {layout === "single" ? (
              <div className="relative h-full w-full">{singlePane === "design" ? designPane : livePane}</div>
            ) : (
              <>
                <div
                  style={
                    layout === "side-by-side"
                      ? { width: `${splitPercent}%` }
                      : { height: `${splitPercent}%` }
                  }
                  className="relative shrink-0"
                >
                  {designPane}
                  <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium">
                    {design.label}
                  </span>
                </div>

                <div
                  onPointerDown={handleSplitterPointerDown}
                  onPointerMove={handleSplitterPointerMove}
                  onPointerUp={handleSplitterPointerUp}
                  className={cn(
                    "shrink-0 touch-none bg-border transition-colors hover:bg-primary/50",
                    layout === "side-by-side" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
                  )}
                />

                <div className="relative min-w-0 flex-1">
                  {livePane}
                  <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium">
                    {live.label}
                  </span>
                </div>
              </>
            )}
            {commentPanel}
          </div>
        </>
      )}
    </div>
  );
}
