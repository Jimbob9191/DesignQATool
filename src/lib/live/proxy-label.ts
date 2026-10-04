// Shared by the app (which hands out proxied URLs) and live-proxy/ (which
// serves them), so it only uses Web Crypto and must not import anything.
//
// A proxied site lives on its own subdomain of the proxy domain, so its
// paths, cookies and storage stay exactly as they are on the real site:
//
//   https://www.acme-co.com/pricing
//   → https://s3f9a1c07be-www-acme--co-com.<proxy domain>/pricing
//
// The label is a scheme flag (s = https, i = http), a signature that stops
// the proxy being used for sites nobody set up a comparison for, and the host
// with "-" doubled and "." turned into "-" (unambiguous, since a DNS label
// can't start or end with "-").

export type ProxyTarget = { scheme: "https" | "http"; host: string; origin: string };

const SIGNATURE_LENGTH = 10;
const MAX_LABEL_LENGTH = 63;
const LABEL_PATTERN = /^([si])([0-9a-f]{10})-([a-z0-9-]+)$/;

export function encodeHost(host: string): string {
  return host.toLowerCase().replace(/-/g, "--").replace(/\./g, "-");
}

export function decodeHost(encoded: string): string {
  let host = "";
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] !== "-") {
      host += encoded[i];
    } else if (encoded[i + 1] === "-") {
      host += "-";
      i++;
    } else {
      host += ".";
    }
  }
  return host;
}

/** Hosts the proxy will never fetch, whatever the signature says. */
function isProxyableHost(host: string): boolean {
  return (
    /^[a-z0-9.-]+$/.test(host) &&
    host.includes(".") &&
    !/^[\d.]+$/.test(host) && // IPv4 literal
    !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)
  );
}

async function sign(secret: string, origin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(origin)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, SIGNATURE_LENGTH);
}

/** The subdomain label for a real URL's origin, or null if it can't be proxied. */
export async function proxyLabelFor(secret: string, url: string | URL): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();
  if (!isProxyableHost(host)) return null;

  const scheme = parsed.protocol === "https:" ? "https" : "http";
  const label = `${scheme === "https" ? "s" : "i"}${await sign(secret, `${scheme}://${host}`)}-${encodeHost(host)}`;
  return label.length <= MAX_LABEL_LENGTH ? label : null;
}

/** The real origin a label stands for, or null if it's malformed or the signature is wrong. */
export async function targetFromLabel(secret: string, label: string): Promise<ProxyTarget | null> {
  const match = LABEL_PATTERN.exec(label.toLowerCase());
  if (!match) return null;
  const scheme = match[1] === "s" ? "https" : "http";
  const host = decodeHost(match[3]);
  if (!isProxyableHost(host)) return null;

  const origin = `${scheme}://${host}`;
  const expected = await sign(secret, origin);
  let diff = 0;
  for (let i = 0; i < SIGNATURE_LENGTH; i++) diff |= expected.charCodeAt(i) ^ match[2].charCodeAt(i);
  return diff === 0 ? { scheme, host, origin } : null;
}
