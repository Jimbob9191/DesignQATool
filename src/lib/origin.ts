// Pure origin resolution, kept free of server-only imports so it can be
// unit-tested directly. The server wrapper is getAppOrigin() in
// src/lib/app-origin.ts.

export type OriginInputs = {
  /** The request's Host header, if any. */
  host: string | null;
  /** The request's X-Forwarded-Proto header, if any. */
  forwardedProto: string | null;
  /** NEXT_PUBLIC_SITE_URL: the canonical origin, and the fallback. */
  siteUrl: string;
  /** Vercel's deployment and branch hostnames, set on preview deploys. */
  vercelUrl?: string;
  vercelBranchUrl?: string;
  /** Whether this is a dev server, where any localhost port is trusted. */
  isDev: boolean;
};

function isLocalHost(host: string): boolean {
  const hostname = host.replace(/:\d+$/, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The origin to put in absolute links the app hands out — share links, the
 * bridge snippet, and the print URL capture-service fetches. The Host header
 * is only honoured when it names a host we deploy to; anything else (say, a
 * spoofed Host off Vercel or behind a misconfigured proxy) gets the site URL,
 * so a request can't make the app mint links to someone else's domain.
 */
export function resolveAppOrigin({
  host,
  forwardedProto,
  siteUrl,
  vercelUrl,
  vercelBranchUrl,
  isDev,
}: OriginInputs): string {
  const site = new URL(siteUrl);
  if (!host) return site.origin;
  const requested = host.trim().toLowerCase();

  if (requested === site.host) return site.origin;

  const previewHosts = [vercelUrl, vercelBranchUrl].filter(Boolean).map((h) => h!.toLowerCase());
  if (previewHosts.includes(requested)) return `https://${requested}`;

  if (isDev && isLocalHost(requested)) {
    const protocol = forwardedProto === "https" ? "https" : "http";
    return `${protocol}://${requested}`;
  }

  return site.origin;
}
