"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlugZap, X } from "lucide-react";

import {
  APP_SOURCE,
  isBridgeMessage,
  type AppToBridgeMessage,
  type BridgeToAppMessage,
  type ElementInfo,
  type LiveLayout,
  type LiveMode,
  type PinAnchor,
} from "@/lib/live/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BridgeSnippet } from "@/components/comparisons/bridge-snippet";

export type LivePaneHandle = {
  scrollTo: (y: number) => void;
  navigate: (url: string) => void;
  reload: () => void;
};

/** How the framed page maps onto the pane: screen = left + pageX * scale. */
export type LiveTransform = {
  scale: number;
  left: number;
  layout: LiveLayout | null;
};

export type LivePick = Extract<BridgeToAppMessage, { type: "pick" }>;

type Status = "loading" | "connected" | "unreachable";
type OutgoingMessage = AppToBridgeMessage extends infer M ? (M extends unknown ? Omit<M, "source"> : never) : never;

// Long enough for a slow page's async scripts; the bridge also announces
// itself whenever it does load, so a late one still connects.
const CONNECT_TIMEOUT_MS = 5000;

// Without allow-top-navigation a frame-busting script can't navigate the
// app away; the site is otherwise free to run as it normally would.
const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

export function LivePane({
  src,
  viewportWidth,
  mode,
  pins,
  snippet,
  connection,
  onLayout,
  onPick,
  onActivate,
  handleRef,
  overlay,
  className,
}: {
  src: string;
  /** CSS width the site is rendered at; it's scaled down to fit the pane. */
  viewportWidth: number;
  mode: LiveMode;
  pins: PinAnchor[];
  /** The script tag to offer when the page doesn't answer; omit to stay quiet (e.g. for guests). */
  snippet?: string;
  /**
   * How the site is being loaded, and a way to switch, offered when the page
   * doesn't answer: the proxy needs no setup but can't load every site;
   * loading directly works for any site that has the snippet.
   */
  connection?: {
    viaProxy: boolean;
    proxyAvailable: boolean;
    onChange?: (viaProxy: boolean) => void;
  };
  onLayout?: (layout: LiveLayout) => void;
  onPick?: (pick: LivePick) => void;
  onActivate?: () => void;
  handleRef?: (handle: LivePaneHandle) => void;
  /** Renders pins and other layers above the page, in pane coordinates. */
  overlay?: (transform: LiveTransform) => React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [frameSrc, setFrameSrc] = useState(src);
  const [frameKey, setFrameKey] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  // Bumped on every "ready": each page load inside the frame runs a fresh
  // bridge that needs the mode and pins sent again.
  const [bridgeSession, setBridgeSession] = useState(0);
  const [layout, setLayout] = useState<LiveLayout | null>(null);
  const [helpDismissed, setHelpDismissed] = useState(false);

  // Where the bridge answered from. Pins (selectors, page text) are only
  // ever posted there — never to whatever origin the frame wandered off to.
  const bridgeOriginRef = useRef<string | null>(null);
  const lastReadyAtRef = useRef(0);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    setFrameSrc(src);
    setStatus("loading");
    setHelpDismissed(false);
  }, [src]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Hidden (display: none) reads as 0×0; keep the last real size so the
      // frame stays loaded for when it's shown again.
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const send = useCallback((message: OutgoingMessage) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const origin = message.type === "hello" ? "*" : bridgeOriginRef.current;
    if (!origin) return;
    target.postMessage({ ...message, source: APP_SOURCE }, origin);
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow || !isBridgeMessage(event.data)) return;
      const message = event.data;
      if (message.type === "ready") {
        bridgeOriginRef.current = event.origin;
        lastReadyAtRef.current = performance.now();
        setStatus("connected");
        setBridgeSession((c) => c + 1);
        return;
      }
      if (event.origin !== bridgeOriginRef.current) return;
      if (message.type === "layout") {
        setLayout(message);
        onLayoutRef.current?.(message);
      } else if (message.type === "pick") {
        onPickRef.current?.(message);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Each page load runs a fresh copy of the bridge; say hello and give it a
  // moment to answer before deciding the snippet isn't there.
  function handleLoad() {
    const loadedAt = performance.now();
    setLayout(null);
    send({ type: "hello" });
    window.setTimeout(() => {
      if (lastReadyAtRef.current < loadedAt) setStatus("unreachable");
    }, CONNECT_TIMEOUT_MS);
  }

  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    if (bridgeSession === 0) return;
    send({ type: "mode", mode });
  }, [bridgeSession, mode, send]);
  useEffect(() => {
    if (bridgeSession === 0) return;
    send({ type: "pins", pins: JSON.parse(pinsKey) as PinAnchor[] });
  }, [bridgeSession, pinsKey, send]);

  useEffect(() => {
    handleRef?.({
      scrollTo: (y) => send({ type: "scrollTo", y }),
      navigate: (url) => {
        setStatus("loading");
        setFrameSrc(url);
        setFrameKey((k) => k + 1);
      },
      reload: () => {
        setStatus("loading");
        setFrameKey((k) => k + 1);
      },
    });
  }, [handleRef, send]);

  const scale = size.width > 0 ? Math.min(1, size.width / viewportWidth) : 1;
  const left = Math.max(0, (size.width - viewportWidth * scale) / 2);
  const frameHeight = size.height > 0 ? size.height / scale : 0;
  const hover = mode === "comment" ? layout?.hover ?? null : null;

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-muted", className)}
      onPointerEnter={onActivate}
    >
      {frameHeight > 0 ? (
        <iframe
          key={frameKey}
          ref={iframeRef}
          src={frameSrc}
          title="Live site"
          sandbox={SANDBOX}
          onLoad={handleLoad}
          className="absolute top-0 border-0 bg-white"
          style={{
            left,
            width: viewportWidth,
            height: frameHeight,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {overlay?.({ scale, left, layout })}
        {hover ? <HoverHighlight element={hover} scale={scale} left={left} /> : null}
      </div>

      {status === "loading" ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs text-muted-foreground">
          Connecting…
        </span>
      ) : null}

      {status === "unreachable" && snippet && !helpDismissed ? (
        <ConnectHelp snippet={snippet} connection={connection} onDismiss={() => setHelpDismissed(true)} />
      ) : null}
    </div>
  );
}

function HoverHighlight({ element, scale, left }: { element: ElementInfo; scale: number; left: number }) {
  const { rect, styles } = element;
  const x = left + rect.x * scale;
  const y = rect.y * scale;
  const details = [
    `${Math.round(rect.width)}×${Math.round(rect.height)}`,
    `${styles.fontFamily} ${styles.fontSize}/${styles.lineHeight} ${styles.fontWeight}`,
    cssColorToHex(styles.color),
  ];

  return (
    <>
      <div
        className="absolute border-2 border-status-open bg-status-open/10"
        style={{ left: x, top: y, width: rect.width * scale, height: rect.height * scale }}
      />
      <div
        className="absolute flex max-w-[90%] items-center gap-2 truncate rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background shadow"
        style={{ left: Math.max(4, x), top: y > 22 ? y - 20 : y + rect.height * scale + 4 }}
      >
        <span className="font-semibold">{element.label}</span>
        <span className="opacity-75">{details.join(" · ")}</span>
      </div>
    </>
  );
}

function ConnectHelp({
  snippet,
  connection,
  onDismiss,
}: {
  snippet: string;
  connection?: React.ComponentProps<typeof LivePane>["connection"];
  onDismiss: () => void;
}) {
  const viaProxy = connection?.viaProxy ?? false;
  const canSwitch = Boolean(connection?.onChange) && (viaProxy || connection?.proxyAvailable);

  return (
    // Keeps clear of the floating comment panel (see --comment-inset) while
    // there's room for the card, and otherwise sits above it.
    <div
      className="absolute top-3 left-3 z-30 rounded-lg border border-border bg-background p-4 shadow-lg"
      style={{ right: "clamp(0.75rem, var(--comment-inset, 0.75rem), 100% - 22rem)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PlugZap className="h-4 w-4 text-status-needs-review" />
          {viaProxy
            ? "This site didn’t load properly through the preview proxy"
            : "This page isn’t talking to DesignParity.app"}
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-7 w-7" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {viaProxy ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Some sites block proxies or rely on things a proxy can&rsquo;t pass on (sign-ins, strict
          security settings). Load it directly instead and add this snippet to the site — staging or
          localhost is fine.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          You can still look at the site, but pinning elements needs this snippet on it (staging or
          localhost is fine). If the site sends <code>X-Frame-Options</code> or a CSP{" "}
          <code>frame-ancestors</code> header it also has to allow being framed by this app.
        </p>
      )}
      <div className="mt-3">
        <BridgeSnippet snippet={snippet} />
      </div>
      {canSwitch ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant={viaProxy ? "default" : "outline"} onClick={() => connection?.onChange?.(!viaProxy)}>
            {viaProxy ? "Load it directly" : "Try the preview proxy instead"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function cssColorToHex(color: string): string {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  if (!match) return color;
  const hex = [match[1], match[2], match[3]]
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const alpha = match[4] !== undefined ? Number(match[4]) : 1;
  return alpha < 1 ? `#${hex} ${Math.round(alpha * 100)}%` : `#${hex}`;
}
