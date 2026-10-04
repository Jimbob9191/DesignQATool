import { proxyLabelFor, targetFromLabel, type ProxyTarget } from "../../src/lib/live/proxy-label.ts";

// Serves a real site from <label>.<proxy domain> so DesignParity.app can frame
// it and pin its elements without the site installing anything: the headers
// that stop framing are dropped, the bridge script is added to every page,
// and links back to the site are pointed at the proxy. Written against the
// Fetch API only, so the same code runs as a Cloudflare Worker (worker.ts)
// and under Node for local development (dev-server.ts).

export type ProxyConfig = {
  /** What the labels hang off, e.g. "dpproxy.com", or "proxy.localhost:8788" locally. */
  proxyDomain: string;
  proxyScheme: "https" | "http";
  secret: string;
  /**
   * App origins allowed to frame proxied pages — nothing else can, so the
   * proxy can't be used to put someone else's site on our domain. The first
   * one also serves bridge.js.
   */
  appOrigins: string[];
};

// Response headers that would stop the page loading in our frame, pin it to
// the real origin, or outlive the proxied session.
const DROPPED_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "clear-site-data",
  "report-to",
  "reporting-endpoints",
  "nel",
  "alt-svc",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "set-cookie",
];

const DROPPED_REQUEST_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "accept-encoding",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
];

const REWRITTEN_CONTENT_TYPES = /^(text\/html|text\/css|application\/(x-)?javascript|text\/javascript|application\/json|application\/manifest\+json|image\/svg\+xml)/i;

// Second-level suffixes where the "site" is three labels, not two.
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "co.nz", "org.nz", "co.jp", "co.kr",
  "com.br", "com.mx", "com.sg", "com.hk", "com.tr", "co.za", "co.in", "co.il",
]);

/** The registrable domain, approximately: hosts sharing it are proxied together. */
export function siteOf(host: string): string {
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class OriginMap {
  private cache = new Map<string, Promise<string | null>>();
  private config: ProxyConfig;
  readonly target: ProxyTarget;
  readonly site: string;

  constructor(config: ProxyConfig, target: ProxyTarget, site: string) {
    this.config = config;
    this.target = target;
    this.site = site;
  }

  inSite(host: string): boolean {
    return host === this.site || host.endsWith(`.${this.site}`);
  }

  /** Proxy origin for a real origin on the same site; null for anything else. */
  toProxy(realOrigin: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(realOrigin);
    } catch {
      return Promise.resolve(null);
    }
    if (!this.inSite(url.hostname)) return Promise.resolve(null);
    const key = `${url.protocol}//${url.hostname}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = proxyLabelFor(this.config.secret, key).then((label) =>
        label ? `${this.config.proxyScheme}://${label}.${this.config.proxyDomain}` : null
      );
      this.cache.set(key, pending);
    }
    return pending;
  }

  /** Real origin for one of our proxy origins; null if it isn't one. */
  async toReal(proxyOrigin: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(proxyOrigin);
    } catch {
      return null;
    }
    const suffix = `.${this.config.proxyDomain}`;
    if (!url.host.endsWith(suffix)) return null;
    const target = await targetFromLabel(this.config.secret, url.host.slice(0, -suffix.length));
    return target?.origin ?? null;
  }

  async urlToProxy(realUrl: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(realUrl);
    } catch {
      return null;
    }
    const origin = await this.toProxy(url.origin);
    return origin ? origin + url.pathname + url.search + url.hash : null;
  }

  async urlToReal(proxyUrl: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(proxyUrl);
    } catch {
      return null;
    }
    const origin = await this.toReal(url.origin);
    return origin ? origin + url.pathname + url.search + url.hash : null;
  }

  /**
   * Points absolute URLs on the site (https://acme.com/…, //cdn.acme.com/…,
   * and their JSON-escaped forms) at the proxy, so fonts, API calls and
   * links keep working same-origin instead of tripping over CORS.
   */
  async rewriteText(text: string): Promise<string> {
    const pattern = new RegExp(
      `(https?:)?(\\\\?/\\\\?/)((?:[a-z0-9-]+\\.)*${escapeRegExp(this.site)})(?![a-z0-9-]|\\.[a-z0-9])`,
      "gi"
    );
    const hosts = new Set<string>();
    for (const match of text.matchAll(pattern)) hosts.add(match[3].toLowerCase());
    if (hosts.size === 0) return text;

    const proxyHosts = new Map<string, string>();
    await Promise.all(
      Array.from(hosts, async (host) => {
        const origin = await this.toProxy(`${this.target.scheme}://${host}`);
        if (origin) proxyHosts.set(host, new URL(origin).host);
      })
    );

    return text.replace(pattern, (whole, scheme: string | undefined, slashes: string, host: string) => {
      const proxyHost = proxyHosts.get(host.toLowerCase());
      if (!proxyHost) return whole;
      return `${scheme ? `${this.config.proxyScheme}:` : ""}${slashes}${proxyHost}`;
    });
  }
}

function errorPage(status: number, title: string, detail: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:14px system-ui,sans-serif;color:#333;padding:32px;max-width:560px">
<h1 style="font-size:18px">${title}</h1><p>${detail}</p></body>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
  });
}

function rewriteSetCookie(cookie: string, secure: boolean): string {
  // Host-only on the proxy subdomain (each site has its own), and usable
  // inside the app's frame: third-party, so SameSite=None + Partitioned.
  const [pair, ...attributes] = cookie.split(";").map((part) => part.trim());
  const kept = attributes.filter(
    (attribute) => !/^(domain|samesite|secure|partitioned)(=|$)/i.test(attribute)
  );
  return [pair, ...kept, ...(secure ? ["Secure", "SameSite=None", "Partitioned"] : ["SameSite=Lax"])].join(
    "; "
  );
}

// Runs before any of the site's own scripts. Pages build URLs at runtime
// that the text rewrite can't see — API calls, and redirects back to "their"
// origin when they notice they're somewhere else (some sites do this on
// purpose). This keeps both on the proxy.
function proxyRuntime(realOrigin: string, site: string): string {
  return `(function () {
  var REAL = ${JSON.stringify(realOrigin)}, SITE = ${JSON.stringify(site)}, PROXY = location.origin;
  function toProxy(value) {
    try {
      var url = new URL(value, location.href);
      var host = url.hostname;
      if (url.origin === PROXY || !(host === SITE || host.slice(-SITE.length - 1) === "." + SITE)) return null;
      return url.origin === REAL
        ? PROXY + url.pathname + url.search + url.hash
        : PROXY + "/__dp/goto?url=" + encodeURIComponent(url.href);
    } catch (e) {
      return null;
    }
  }
  if (window.navigation) {
    navigation.addEventListener("navigate", function (event) {
      var to = toProxy(event.destination.url);
      if (!to || !event.cancelable) return;
      event.preventDefault();
      var destination = new URL(event.destination.url);
      // A redirect to this same page on the real origin is the site insisting
      // on its own domain — staying put keeps the page working.
      if (destination.pathname + destination.search !== location.pathname + location.search) {
        location.href = to;
      }
    });
  }
  var sameOrigin = function (value) {
    var to = toProxy(value);
    return to && to.indexOf("/__dp/goto") === -1 ? to : null;
  };
  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input instanceof URL ? input.href : input && input.url;
      var to = url && sameOrigin(url);
      if (to) input = typeof input === "string" || input instanceof URL ? to : new Request(to, input);
      return nativeFetch.call(this, input, init);
    };
  }
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var to = sameOrigin(String(url));
    if (to) arguments[1] = to;
    return open.apply(this, arguments);
  };
})();`;
}

function injectBridge(html: string, config: ProxyConfig, realOrigin: string, site: string): string {
  const tags =
    `<script>${proxyRuntime(realOrigin, site)}</script>` +
    `<script src="${config.appOrigins[0]}/bridge.js" data-dp-real-origin="${realOrigin}" async></script>`;
  const cleaned = html
    // A meta CSP would block the bridge just like the header we dropped.
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "")
    // Rewritten files no longer match their hashes.
    .replace(/\sintegrity\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const head = /<head(\s[^>]*)?>/i.exec(cleaned);
  if (head) {
    const at = head.index + head[0].length;
    return cleaned.slice(0, at) + tags + cleaned.slice(at);
  }
  return tags + cleaned;
}

export async function handleProxyRequest(request: Request, config: ProxyConfig): Promise<Response> {
  const url = new URL(request.url);
  const suffix = `.${config.proxyDomain}`;
  if (!url.host.endsWith(suffix)) {
    return errorPage(404, "DesignParity.app live preview", "Nothing to see here.");
  }

  const target = await targetFromLabel(config.secret, url.host.slice(0, -suffix.length));
  if (!target) {
    return errorPage(404, "Preview not found", "This preview link isn't valid.");
  }

  const origins = new OriginMap(config, target, siteOf(target.host));
  const secure = config.proxyScheme === "https";

  // Lets the app open another page of the same site, on another host, without
  // having to sign that host itself.
  if (url.pathname === "/__dp/goto") {
    const destination = await origins.urlToProxy(url.searchParams.get("url") ?? "");
    return destination
      ? Response.redirect(destination, 302)
      : errorPage(400, "Can't open that page", "It isn't part of the site being previewed.");
  }

  // The site's own service worker would take over the proxy origin and serve
  // pages without the bridge.
  if (request.headers.get("service-worker") === "script") {
    return new Response("Service workers are disabled in DesignParity.app previews.", { status: 404 });
  }

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (DROPPED_REQUEST_HEADERS.includes(name) || name.startsWith("cf-")) continue;
    headers.set(name, value);
  }
  for (const name of ["origin", "referer"]) {
    const value = headers.get(name);
    if (!value) continue;
    const real = name === "origin" ? await origins.toReal(value) : await origins.urlToReal(value);
    if (real) headers.set(name, real);
    else headers.delete(name);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.origin + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      // Node's fetch needs this to stream a request body; Workers ignore it.
      ...({ duplex: "half" } as object),
    });
  } catch {
    return errorPage(502, `Couldn't reach ${target.host}`, "The site didn't respond to the preview proxy.");
  }

  const responseHeaders = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!DROPPED_RESPONSE_HEADERS.includes(name)) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", rewriteSetCookie(cookie, secure));
  }

  const location = upstream.headers.get("location");
  if (location) {
    const absolute = new URL(location, target.origin + url.pathname).toString();
    responseHeaders.set("location", (await origins.urlToProxy(absolute)) ?? absolute);
  }
  const allowOrigin = upstream.headers.get("access-control-allow-origin");
  if (allowOrigin && allowOrigin !== "*") {
    responseHeaders.set("access-control-allow-origin", (await origins.toProxy(allowOrigin)) ?? allowOrigin);
  }

  responseHeaders.set(
    "content-security-policy",
    `frame-ancestors 'self' ${config.appOrigins.join(" ")}`
  );
  responseHeaders.set("x-robots-tag", "noindex, nofollow");

  const contentType = upstream.headers.get("content-type") ?? "";
  const hasBody = request.method !== "HEAD" && upstream.status !== 204 && upstream.status !== 304;
  if (!hasBody || !REWRITTEN_CONTENT_TYPES.test(contentType)) {
    return new Response(hasBody ? upstream.body : null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  const isHtml = /^text\/html/i.test(contentType);
  let text = await upstream.text();
  if (isHtml) {
    // Next.js streams its page data in inline scripts as byte-length-prefixed
    // chunks; rewriting URLs inside them corrupts the lengths and the page
    // fails to hydrate. They're left alone — the runtime catches the links
    // and requests they lead to instead.
    const untouched: string[] = [];
    text = text.replace(/<script\b[^>]*>\s*\(?self\.__next_f[\s\S]*?<\/script>/g, (block) => {
      untouched.push(block);
      return `\u0000dp${untouched.length - 1}\u0000`;
    });
    text = await origins.rewriteText(text);
    text = text.replace(/\u0000dp(\d+)\u0000/g, (_, index: string) => untouched[Number(index)]);
    text = injectBridge(text, config, target.origin, origins.site);
  } else {
    text = await origins.rewriteText(text);
  }
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
