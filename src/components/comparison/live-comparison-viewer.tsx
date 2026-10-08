"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Blend, ExternalLink, MessageSquarePlus, MousePointer2, RotateCw } from "lucide-react";

import type { PanZoomState } from "@/hooks/use-pan-zoom";
import { pinAnchorFor } from "@/lib/live/anchor";
import { proxiedFrameUrl, samePage, type LiveLayout, type LiveMode, type Rect } from "@/lib/live/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AnnotationData, ComparisonImage } from "@/components/comparison/comparison-viewer";
import { LayoutTabs, SyncToggle, type Layout } from "@/components/comparison/layout-tabs";
import { matchesPinFilters, type PinFilters } from "@/components/comparison/pin-filters";
import { ImagePane, type ImagePaneHandle, type PaneTransform } from "@/components/comparison/image-pane";
import { LivePane, type LivePaneHandle, type LivePick, type LiveTransform } from "@/components/comparison/live-pane";
import { PinMarker } from "@/components/comparison/pin-marker";

export type LiveSite = {
  url: string;
  viewportWidth: number;
  label: string;
  /** Where the preview proxy serves this site's origin, if it can. */
  proxyOrigin: string | null;
  /** Load through the proxy (no setup) rather than directly (needs the snippet). */
  viaProxy: boolean;
};

export type LiveAnnotationData = AnnotationData & {
  elementSelector: string | null;
  elementRect: Rect | null;
  elementText: string | null;
  pageUrl: string | null;
};

type PaneId = "design" | "live";

const INITIAL_VIEW: PanZoomState = { scale: 1, tx: 0, ty: 0 };
// After the design pane drives the site's scroll, ignore the site's scroll
// reports for a moment so they don't fight the drag/wheel still under way.
const DESIGN_DRIVE_HOLD_MS = 250;

export function LiveComparisonViewer({
  design,
  site,
  snippet,
  annotations,
  selectedAnnotationId,
  filters,
  onSelectAnnotation,
  onCreateDesignAnnotation,
  onCreateLiveAnnotation,
  onDragAnnotation,
  onViaProxyChange,
  commentPanel,
}: {
  design: ComparisonImage;
  site: LiveSite;
  snippet: string;
  annotations: LiveAnnotationData[];
  selectedAnnotationId: string | null;
  /** Set from the comment panel. */
  filters: PinFilters;
  onSelectAnnotation: (id: string) => void;
  onCreateDesignAnnotation?: (point: { x: number; y: number }) => void;
  onCreateLiveAnnotation?: (pick: LivePick) => void;
  onDragAnnotation?: (id: string, next: { xRatio: number; yPx: number }) => void;
  onViaProxyChange?: (viaProxy: boolean) => void;
  /** Floated over the right edge of the canvas. */
  commentPanel?: React.ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>("side-by-side");
  const [singlePane, setSinglePane] = useState<PaneId>("live");
  const [mode, setMode] = useState<LiveMode>(onCreateLiveAnnotation ? "comment" : "browse");
  const [syncLocked, setSyncLocked] = useState(true);
  const [splitPercent, setSplitPercent] = useState(50);
  const [designView, setDesignView] = useState<PanZoomState>(INITIAL_VIEW);
  const [liveLayout, setLiveLayout] = useState<LiveLayout | null>(null);
  // The real-site URL the frame was last pointed at — switching between the
  // proxy and direct reopens the page you were on, not the comparison's.
  const [startUrl, setStartUrl] = useState(site.url);
  const [opacity, setOpacity] = useState(50);
  const [blendDifference, setBlendDifference] = useState(false);
  const [dividerPercent, setDividerPercent] = useState(50);

  const rootRef = useRef<HTMLDivElement>(null);
  const designHandle = useRef<ImagePaneHandle | null>(null);
  const liveHandle = useRef<LivePaneHandle | null>(null);
  const isDraggingSplitter = useRef(false);
  const liveLayoutRef = useRef<LiveLayout | null>(null);
  const designDrivenUntil = useRef(0);
  const fittingDesign = useRef(false);
  const pendingReveal = useRef<string | null>(null);

  const useProxy = site.viaProxy && site.proxyOrigin !== null;
  const siteOrigin = useMemo(() => new URL(site.url).origin, [site.url]);

  // Pins and the address bar always deal in real-site URLs; only the frame
  // itself is pointed at the proxy.
  const toFrameUrl = useCallback(
    (realUrl: string) => {
      if (!useProxy || !site.proxyOrigin) return realUrl;
      return proxiedFrameUrl(realUrl, siteOrigin, site.proxyOrigin);
    },
    [useProxy, site.proxyOrigin, siteOrigin]
  );

  function handleViaProxyChange(viaProxy: boolean) {
    setStartUrl(liveLayoutRef.current?.url ?? site.url);
    onViaProxyChange?.(viaProxy);
  }

  // Design pixels per CSS pixel of the site — 2 for an @2x export.
  const designPerSitePx = design.width / site.viewportWidth;
  const currentUrl = liveLayout?.url ?? site.url;

  const syncLockedRef = useRef(syncLocked);
  syncLockedRef.current = syncLocked;

  const revealIfNeeded = useCallback((next: LiveLayout) => {
    const id = pendingReveal.current;
    if (!id) return;
    const pin = next.pins.find((p) => p.id === id);
    if (!pin) return;
    pendingReveal.current = null;
    if (pin.y < 0 || pin.y > next.viewportHeight) {
      liveHandle.current?.scrollTo(Math.max(0, next.scrollY + pin.y - next.viewportHeight / 3));
    }
  }, []);

  const handleLiveLayout = useCallback(
    (next: LiveLayout) => {
      liveLayoutRef.current = next;
      setLiveLayout(next);
      revealIfNeeded(next);
      if (!syncLockedRef.current || performance.now() < designDrivenUntil.current) return;
      setDesignView((view) => {
        const ty = -(next.scrollY * designPerSitePx) * view.scale;
        return Math.abs(view.ty - ty) < 0.5 ? view : { ...view, ty };
      });
    },
    [designPerSitePx, revealIfNeeded]
  );

  const handleDesignChange = useCallback(
    (next: PanZoomState) => {
      if (fittingDesign.current) {
        const scrollY = liveLayoutRef.current?.scrollY ?? 0;
        setDesignView(syncLocked ? { ...next, ty: -(scrollY * designPerSitePx) * next.scale } : next);
        return;
      }
      setDesignView(next);
      if (syncLocked) {
        designDrivenUntil.current = performance.now() + DESIGN_DRIVE_HOLD_MS;
        liveHandle.current?.scrollTo(Math.max(0, -next.ty / next.scale / designPerSitePx));
      }
    },
    [syncLocked, designPerSitePx]
  );

  const fitDesign = useCallback(() => {
    fittingDesign.current = true;
    designHandle.current?.fitToWidth();
    fittingDesign.current = false;
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(fitDesign);
    return () => cancelAnimationFrame(id);
  }, [fitDesign, layout, singlePane, splitPercent, design.src]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        fitDesign();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSyncLocked((prev) => !prev);
      } else if ((e.key === "c" || e.key === "C") && onCreateLiveAnnotation) {
        e.preventDefault();
        setMode((prev) => (prev === "comment" ? "browse" : "comment"));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fitDesign, onCreateLiveAnnotation]);

  // Selecting a pin in the sidebar brings it into view — loading its page
  // first if the frame is somewhere else on the site.
  useEffect(() => {
    if (!selectedAnnotationId) return;
    const annotation = annotations.find((a) => a.id === selectedAnnotationId);
    if (!annotation || annotation.target !== "live" || !annotation.pageUrl) return;
    pendingReveal.current = annotation.id;
    if (!samePage(annotation.pageUrl, liveLayoutRef.current?.url ?? site.url)) {
      liveHandle.current?.navigate(toFrameUrl(annotation.pageUrl));
    } else if (liveLayoutRef.current) {
      revealIfNeeded(liveLayoutRef.current);
    }
    // only on a new selection, not every time annotations change
  }, [selectedAnnotationId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSplitPercent(Math.min(85, Math.max(15, percent)));
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

  const trackedPins = useMemo(
    () =>
      visibleAnnotations
        .filter((a) => a.target === "live" && a.pageUrl && samePage(a.pageUrl, currentUrl))
        .map((a) => pinAnchorFor(a, site.viewportWidth)),
    [visibleAnnotations, currentUrl, site.viewportWidth]
  );

  const annotationsById = useMemo(
    () => new Map(annotations.map((a) => [a.id, a])),
    [annotations]
  );

  function handleDesignClick(point: { x: number; y: number }) {
    if (!onCreateDesignAnnotation || mode !== "comment") return;
    if (point.x < 0 || point.x > design.width || point.y < 0 || point.y > design.height) return;
    onCreateDesignAnnotation(point);
  }

  function renderDesignPins(transform: PaneTransform) {
    return visibleAnnotations
      .filter((a) => a.target === "design")
      .map((a) => {
        const screen = transform.imageToScreen(a.xRatio * design.width, a.yPx);
        return (
          <PinMarker
            key={a.id}
            number={a.number}
            status={a.status}
            screenX={screen.x}
            screenY={screen.y}
            scale={transform.scale}
            selected={a.id === selectedAnnotationId}
            onSelect={() => onSelectAnnotation(a.id)}
            onDragEnd={
              onDragAnnotation
                ? (dx, dy) =>
                    onDragAnnotation(a.id, {
                      xRatio: Math.min(1, Math.max(0, (a.xRatio * design.width + dx) / design.width)),
                      yPx: Math.max(0, a.yPx + dy),
                    })
                : undefined
            }
          />
        );
      });
  }

  function renderLivePins({ scale, left, layout: pageLayout }: LiveTransform) {
    if (!pageLayout) return null;
    return pageLayout.pins.map((pin) => {
      const annotation = annotationsById.get(pin.id);
      if (!annotation) return null;
      return (
        <PinMarker
          key={pin.id}
          number={annotation.number}
          status={annotation.status}
          screenX={left + pin.x * scale}
          screenY={pin.y * scale}
          scale={scale}
          selected={pin.id === selectedAnnotationId}
          detached={!pin.found}
          onSelect={() => onSelectAnnotation(pin.id)}
        />
      );
    });
  }

  function renderDesignOverlay({ scale, left, layout: pageLayout }: LiveTransform) {
    const width = site.viewportWidth * scale;
    const top = -(pageLayout?.scrollY ?? 0) * scale;
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL laid over the live frame */}
        <img
          src={design.src}
          alt={design.label}
          draggable={false}
          className="absolute max-w-none"
          style={{
            left,
            top,
            width,
            height: (design.height / designPerSitePx) * scale,
            opacity: layout === "overlay" ? opacity / 100 : 1,
            mixBlendMode: blendDifference ? "difference" : undefined,
            clipPath: layout === "swipe" ? `inset(0 ${100 - dividerPercent}% 0 0)` : undefined,
          }}
        />
        {layout === "swipe" ? (
          <SwipeDivider
            left={left + (width * dividerPercent) / 100}
            onDrag={(clientX, paneLeft) =>
              setDividerPercent(Math.min(100, Math.max(0, ((clientX - paneLeft - left) / width) * 100)))
            }
          />
        ) : null}
        {renderLivePins({ scale, left, layout: pageLayout })}
      </>
    );
  }

  const designPane = (
    <ImagePane
      src={design.src}
      alt={design.label}
      imageWidth={design.width}
      imageHeight={design.height}
      state={designView}
      onChange={handleDesignChange}
      handleRef={(h) => (designHandle.current = h)}
      onImageClick={handleDesignClick}
      overlay={renderDesignPins}
      wheelPans
    />
  );

  const isOverlayLayout = layout === "overlay" || layout === "swipe";
  const showDesign = layout === "side-by-side" || layout === "stacked" || (layout === "single" && singlePane === "design");
  const showLive = layout !== "single" || singlePane === "live";

  const livePane = (
    <LivePane
      src={toFrameUrl(startUrl)}
      viewportWidth={site.viewportWidth}
      mode={mode}
      pins={trackedPins}
      snippet={snippet}
      connection={{
        viaProxy: useProxy,
        proxyAvailable: site.proxyOrigin !== null,
        onChange: onViaProxyChange ? handleViaProxyChange : undefined,
      }}
      onLayout={handleLiveLayout}
      onPick={onCreateLiveAnnotation}
      handleRef={(h) => (liveHandle.current = h)}
      overlay={isOverlayLayout ? renderDesignOverlay : renderLivePins}
    />
  );

  const otherPagePins = annotations.filter(
    (a) => a.target === "live" && a.pageUrl && !samePage(a.pageUrl, currentUrl)
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same gutter as the top bar, and the same height while it fits on one line. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <LayoutTabs value={layout} onValueChange={setLayout} />

        {onCreateLiveAnnotation ? (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Tabs value={mode} onValueChange={(v) => setMode(v as LiveMode)}>
                <TabsList>
                  <TabsTrigger value="comment">
                    <MessageSquarePlus className="h-4 w-4" />
                    Comment
                  </TabsTrigger>
                  <TabsTrigger value="browse">
                    <MousePointer2 className="h-4 w-4" />
                    Browse
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex-col items-start gap-1">
              <p>Comment: click any element on the site, or a spot on the design, to pin it.</p>
              <p>Browse: use the site normally.</p>
              <p>Scroll either side to move both. Pinch or ⌘-scroll to zoom the design.</p>
              <p>Shortcuts: C comment/browse, S sync, F fit design.</p>
              {useProxy ? <p>Page look wrong? Switch to Direct and add the snippet to the site.</p> : null}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* An address bar for the framed site. It takes the room left over and
            wraps onto its own line rather than squeezing the URL to nothing. */}
        <div className="flex h-8 min-w-72 flex-1 basis-72 items-center gap-1 overflow-hidden rounded-lg border border-border pr-1 text-xs text-muted-foreground">
          {site.proxyOrigin && onViaProxyChange ? (
            <Select
              value={useProxy ? "proxy" : "direct"}
              onValueChange={(v) => handleViaProxyChange(v === "proxy")}
            >
              <SelectTrigger
                size="sm"
                className="h-full shrink-0 gap-1 rounded-none border-0 border-r border-border px-2 text-xs shadow-none dark:bg-transparent"
                title="How the site is loaded"
              >
                <SelectValue>{useProxy ? "Proxy" : "Direct"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proxy">Preview proxy — no setup</SelectItem>
                <SelectItem value="direct">Direct — needs the snippet</SelectItem>
              </SelectContent>
            </Select>
          ) : site.proxyOrigin ? (
            <span className="flex h-full shrink-0 items-center border-r border-border px-2">
              {useProxy ? "Proxy" : "Direct"}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate pl-2 font-mono text-foreground" title={currentUrl}>
            {currentUrl}
          </span>
          {otherPagePins > 0 ? (
            <span className="shrink-0" title="Pins on other pages of the site">
              +{otherPagePins} on other pages
            </span>
          ) : null}
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono" title="Viewport width">
            {site.viewportWidth}px
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
            <a href={currentUrl} target="_blank" rel="noopener noreferrer" title="Open in a new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => liveHandle.current?.reload()}
            title="Reload the site"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {layout === "overlay" ? (
          <div className="flex w-40 items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">Design</Label>
            <Slider value={[opacity]} onValueChange={([v]) => setOpacity(v)} min={0} max={100} step={1} />
          </div>
        ) : null}
        {isOverlayLayout ? (
          <Button
            variant={blendDifference ? "secondary" : "outline"}
            size="sm"
            onClick={() => setBlendDifference((prev) => !prev)}
            title="Show the difference between design and site"
          >
            <Blend className="h-4 w-4" />
            Difference
          </Button>
        ) : null}
        {layout === "single" ? (
          <Tabs value={singlePane} onValueChange={(v) => setSinglePane(v as PaneId)}>
            <TabsList>
              <TabsTrigger value="design">{design.label}</TabsTrigger>
              <TabsTrigger value="live">{site.label}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {layout === "side-by-side" || layout === "stacked" ? (
          <SyncToggle synced={syncLocked} onSyncedChange={setSyncLocked} />
        ) : null}
      </div>

      <div
        ref={rootRef}
        className={cn(
          "relative flex min-h-0 flex-1 overflow-hidden",
          // Room taken on the right by the floating comment panel, or its show button.
          "[&:has([data-comment-panel=open])]:[--comment-inset:21rem] [&:has([data-comment-panel=closed])]:[--comment-inset:5.5rem]",
          layout === "stacked" ? "flex-col" : "flex-row"
        )}
      >
        {/* The live pane keeps the same place in the tree in every layout, so
            switching layouts never reloads the site or loses its page. */}
        {showDesign ? (
          <div
            style={
              layout === "single"
                ? undefined
                : layout === "side-by-side"
                  ? { width: `${splitPercent}%` }
                  : { height: `${splitPercent}%` }
            }
            className={cn("relative", layout === "single" ? "h-full w-full" : "shrink-0")}
          >
            {designPane}
            {layout !== "single" ? (
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium">
                {design.label}
              </span>
            ) : null}
          </div>
        ) : null}

        {layout === "side-by-side" || layout === "stacked" ? (
          <div
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={handleSplitterPointerUp}
            className={cn(
              "shrink-0 touch-none bg-border transition-colors hover:bg-primary/50",
              layout === "side-by-side" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
            )}
          />
        ) : null}

        <div className={cn("relative min-w-0 flex-1", !showLive && "hidden", layout === "single" && "h-full")}>
          {livePane}
        </div>
        {commentPanel}
      </div>

    </div>
  );
}

function SwipeDivider({
  left,
  onDrag,
}: {
  left: number;
  onDrag: (clientX: number, paneLeft: number) => void;
}) {
  const dragging = useRef(false);

  return (
    <div
      className="pointer-events-auto absolute inset-y-0 w-4 -translate-x-1/2 cursor-col-resize touch-none"
      style={{ left }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const pane = e.currentTarget.parentElement?.getBoundingClientRect();
        onDrag(e.clientX, pane?.left ?? 0);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <div className="mx-auto h-full w-0.5 bg-primary shadow" />
    </div>
  );
}
