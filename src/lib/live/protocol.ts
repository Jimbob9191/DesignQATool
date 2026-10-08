// Message protocol between the app and public/bridge.js, the snippet a team
// adds to their site so DesignParity.app can frame it and pin real elements.
// bridge.js is plain JS served as-is, so keep it in step with these types by
// hand — and bump BRIDGE_VERSION when a change isn't backwards compatible.

export const BRIDGE_SOURCE = "designparity-bridge";
export const APP_SOURCE = "designparity-app";
export const BRIDGE_VERSION = 1;

export type Rect = { x: number; y: number; width: number; height: number };

/** What the bridge reports about a hovered or picked element. */
export type ElementInfo = {
  selector: string;
  tag: string;
  /** Trimmed, whitespace-collapsed text, first 80 chars — the fallback anchor. */
  text: string;
  /** Short human label, e.g. `button.cta`. */
  label: string;
  /** Viewport (CSS px) rect inside the framed page. */
  rect: Rect;
  /** Same rect in document space (rect + scroll offset). */
  docRect: Rect;
  styles: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    color: string;
    backgroundColor: string;
    padding: string;
    borderRadius: string;
  };
};

/** A pin the app asks the bridge to keep tracking on the current page. */
export type PinAnchor = {
  id: string;
  selector: string | null;
  text: string | null;
  /** Where in the element the pin sits, as 0–1 ratios of its box. */
  offsetX: number;
  offsetY: number;
  /** Document-space position to fall back to when the element can't be found. */
  docX: number;
  docY: number;
};

export type PinPosition = { id: string; x: number; y: number; found: boolean };

export type LiveLayout = {
  url: string;
  scrollX: number;
  scrollY: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Viewport-space positions of the tracked pins. */
  pins: PinPosition[];
  /** The element under the cursor in comment mode, if any. */
  hover: ElementInfo | null;
};

export type LiveMode = "comment" | "browse";

export type AppToBridgeMessage =
  | { source: typeof APP_SOURCE; type: "hello" }
  | { source: typeof APP_SOURCE; type: "mode"; mode: LiveMode }
  | { source: typeof APP_SOURCE; type: "pins"; pins: PinAnchor[] }
  | { source: typeof APP_SOURCE; type: "scrollTo"; y: number };

export type BridgeToAppMessage =
  | {
      source: typeof BRIDGE_SOURCE;
      type: "ready";
      version: number;
      url: string;
      /** True when the live-preview proxy added the bridge, not the site. */
      proxied?: boolean;
    }
  | ({ source: typeof BRIDGE_SOURCE; type: "layout" } & LiveLayout)
  | {
      source: typeof BRIDGE_SOURCE;
      type: "pick";
      url: string;
      element: ElementInfo;
      /** Click point in document space. */
      docPoint: { x: number; y: number };
    };

export function isBridgeMessage(data: unknown): data is BridgeToAppMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === BRIDGE_SOURCE &&
    typeof (data as { type?: unknown }).type === "string"
  );
}

/**
 * Pins are stored against the page they were dropped on. Two URLs count as
 * the same page when origin, path (ignoring a trailing slash) and query
 * match — the hash is only in-page scroll state.
 */
export function samePage(a: string, b: string): boolean {
  return normalizePageUrl(a) === normalizePageUrl(b);
}

export function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Where to point the frame to show `realUrl` through the live-preview proxy:
 * same-origin pages map straight across, anything else goes via its goto
 * route. Pins and the address bar always deal in real-site URLs.
 */
export function proxiedFrameUrl(realUrl: string, siteOrigin: string, proxyOrigin: string): string {
  const url = new URL(realUrl);
  return url.origin === siteOrigin
    ? proxyOrigin + url.pathname + url.search + url.hash
    : `${proxyOrigin}/__dp/goto?url=${encodeURIComponent(realUrl)}`;
}

export function bridgeSnippet(appOrigin: string): string {
  return `<script src="${appOrigin}/bridge.js" async></script>`;
}
