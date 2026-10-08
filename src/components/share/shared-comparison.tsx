"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { proxiedFrameUrl, samePage, type LiveLayout, type PinAnchor } from "@/lib/live/protocol";
import { LivePane, type LivePaneHandle, type LiveTransform } from "@/components/comparison/live-pane";
import { PinMarker, type AnnotationStatus } from "@/components/comparison/pin-marker";
import { PinnedImage, pinElementId, type ImagePin } from "@/components/comparison/pinned-image";
import { ShareThread, threadElementId, type Thread } from "@/components/share/share-thread";

type Image = { src: string; width: number | null; height: number | null };

export type SharePin = {
  id: string;
  number: number;
  status: AnnotationStatus;
  target: "design" | "live";
  xRatio: number;
  yPx: number;
  pageUrl: string | null;
  /** Set for pins on a live site, so the bridge can find their element. */
  anchor: PinAnchor | null;
};

export type ShareLiveSide =
  | { kind: "capture"; image: Image }
  | { kind: "site"; url: string; viewportWidth: number; proxyOrigin: string | null };

/** Where the selection came from: a pin scrolls to its thread, a thread to its pin. */
type Selection = { id: string; from: "pin" | "thread" };

export function SharedComparison({
  design,
  live,
  pins,
  threads,
  token,
  allowComments,
}: {
  design: Image | null;
  live: ShareLiveSide | null;
  pins: SharePin[];
  threads: Thread[];
  token: string;
  allowComments: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedId = selection?.id ?? null;

  const selectFromPin = useCallback((id: string) => setSelection({ id, from: "pin" }), []);

  useEffect(() => {
    if (selection?.from !== "pin") return;
    document
      .getElementById(threadElementId(selection.id))
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selection]);

  useEffect(() => {
    if (selection?.from !== "thread") return;
    document
      .getElementById(pinElementId(selection.id))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selection]);

  const designPins = design ? imagePins(pins, "design", design) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Design</p>
          {design ? (
            <PaneImage image={design} alt="Design" pins={designPins} selectedId={selectedId} onSelect={selectFromPin} />
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Live</p>
          {live?.kind === "capture" ? (
            <PaneImage
              image={live.image}
              alt="Live"
              pins={imagePins(pins, "live", live.image)}
              selectedId={selectedId}
              onSelect={selectFromPin}
            />
          ) : live?.kind === "site" ? (
            <SharedLivePane
              site={live}
              pins={pins}
              selection={selection}
              onSelect={selectFromPin}
            />
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Pins ({threads.length})</h2>
        <div className="flex flex-col gap-3">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pins on this comparison.</p>
          ) : (
            threads.map((thread) => (
              <ShareThread
                key={thread.id}
                thread={thread}
                token={token}
                allowComments={allowComments}
                selected={thread.id === selectedId}
                onSelect={() => setSelection({ id: thread.id, from: "thread" })}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function imagePins(pins: SharePin[], target: SharePin["target"], image: Image): ImagePin[] {
  if (!image.width) return [];
  const width = image.width;
  return pins
    .filter((p) => p.target === target)
    .map((p) => ({ id: p.id, number: p.number, status: p.status, x: p.xRatio * width, y: p.yPx }));
}

function PaneImage({
  image,
  alt,
  pins,
  selectedId,
  onSelect,
}: {
  image: Image;
  alt: string;
  pins: ImagePin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!image.width || !image.height) {
    // Without its size there's nowhere to put the pins; show the image alone.
    // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL
    return <img src={image.src} alt={alt} className="w-full rounded-md border border-border" />;
  }
  return (
    <PinnedImage
      src={image.src}
      alt={alt}
      width={image.width}
      height={image.height}
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}

function SharedLivePane({
  site,
  pins,
  selection,
  onSelect,
}: {
  site: Extract<ShareLiveSide, { kind: "site" }>;
  pins: SharePin[];
  selection: Selection | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveHandle = useRef<LivePaneHandle | null>(null);
  const layoutRef = useRef<LiveLayout | null>(null);
  const pendingReveal = useRef<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(site.url);

  const siteOrigin = useMemo(() => new URL(site.url).origin, [site.url]);
  const toFrameUrl = useCallback(
    (realUrl: string) => (site.proxyOrigin ? proxiedFrameUrl(realUrl, siteOrigin, site.proxyOrigin) : realUrl),
    [site.proxyOrigin, siteOrigin]
  );
  const [startUrl] = useState(() => toFrameUrl(site.url));

  const pinsById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const trackedPins = useMemo(
    () =>
      pins
        .filter((p) => p.target === "live" && p.anchor && p.pageUrl && samePage(p.pageUrl, currentUrl))
        .map((p) => p.anchor!),
    [pins, currentUrl]
  );

  const revealIfNeeded = useCallback((layout: LiveLayout) => {
    const id = pendingReveal.current;
    if (!id) return;
    const pin = layout.pins.find((p) => p.id === id);
    if (!pin) return;
    pendingReveal.current = null;
    if (pin.y < 0 || pin.y > layout.viewportHeight) {
      liveHandle.current?.scrollTo(Math.max(0, layout.scrollY + pin.y - layout.viewportHeight / 3));
    }
  }, []);

  const handleLayout = useCallback(
    (layout: LiveLayout) => {
      layoutRef.current = layout;
      setCurrentUrl(layout.url);
      revealIfNeeded(layout);
    },
    [revealIfNeeded]
  );

  // Picking one of this pane's threads brings the pane on screen, then the
  // pin into view inside it — loading its page first if the frame is
  // somewhere else on the site.
  useEffect(() => {
    if (selection?.from !== "thread") return;
    const pin = pinsById.get(selection.id);
    if (!pin || pin.target !== "live" || !pin.pageUrl) return;
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    pendingReveal.current = pin.id;
    if (!samePage(pin.pageUrl, layoutRef.current?.url ?? site.url)) {
      liveHandle.current?.navigate(toFrameUrl(pin.pageUrl));
    } else if (layoutRef.current) {
      revealIfNeeded(layoutRef.current);
    }
    // only on a new selection, not when a refresh brings new pin data
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderPins({ scale, left, layout }: LiveTransform) {
    if (!layout) return null;
    return layout.pins.map((position) => {
      const pin = pinsById.get(position.id);
      if (!pin) return null;
      return (
        <PinMarker
          key={pin.id}
          number={pin.number}
          status={pin.status}
          screenX={left + position.x * scale}
          screenY={position.y * scale}
          scale={scale}
          selected={pin.id === selection?.id}
          detached={!position.found}
          onSelect={() => onSelect(pin.id)}
        />
      );
    });
  }

  return (
    <div ref={containerRef} className="h-[70vh] overflow-hidden rounded-md border border-border">
      <LivePane
        src={startUrl}
        viewportWidth={site.viewportWidth}
        mode="browse"
        pins={trackedPins}
        onLayout={handleLayout}
        handleRef={(h) => (liveHandle.current = h)}
        overlay={renderPins}
      />
    </div>
  );
}
