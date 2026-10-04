import "server-only";

import { env } from "@/lib/env";

import { proxyLabelFor } from "./proxy-label";

/**
 * Where the live-preview proxy serves a site's origin, e.g.
 * https://s3f9a1c07be-acme-com.<proxy domain>, or null when the proxy isn't
 * configured or can't take that URL (a port, an IP, a very long host…).
 */
export async function proxyOriginFor(url: string): Promise<string | null> {
  if (!env.LIVE_PROXY_DOMAIN || !env.LIVE_PROXY_SECRET) return null;
  const label = await proxyLabelFor(env.LIVE_PROXY_SECRET, url);
  if (!label) return null;
  // Browsers send every *.localhost name to this machine, so local
  // development runs the proxy (live-proxy/src/dev-server.ts) over plain http.
  const scheme = env.LIVE_PROXY_DOMAIN.split(":")[0].endsWith("localhost") ? "http" : "https";
  return `${scheme}://${label}.${env.LIVE_PROXY_DOMAIN}`;
}
