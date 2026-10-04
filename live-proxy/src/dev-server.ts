import { createServer } from "node:http";
import { Readable } from "node:stream";

import { handleProxyRequest, type ProxyConfig } from "./handler.ts";

// Local stand-in for the Worker. Browsers resolve every *.localhost name to
// this machine, so per-site subdomains work with no DNS setup:
//   http://<label>.proxy.localhost:8788/
const port = Number(process.env.PORT ?? 8788);
const config: ProxyConfig = {
  proxyDomain: process.env.PROXY_DOMAIN ?? `proxy.localhost:${port}`,
  proxyScheme: "http",
  // Also accepts the app's own variable name, so it can share its .env.local.
  secret: process.env.PROXY_SECRET ?? required("LIVE_PROXY_SECRET"),
  appOrigins: required("APP_ORIGINS").split(",").map((origin) => origin.trim()),
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

createServer(async (req, res) => {
  try {
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([name, value]) =>
        value === undefined ? [] : Array.isArray(value) ? value.map((v) => [name, v]) : [[name, value]]
      ) as [string, string][],
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      ...({ duplex: "half" } as object),
    });
    const response = await handleProxyRequest(request, config);
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") headers[name] = value;
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers["set-cookie"] = cookies;
    res.writeHead(response.status, headers);
    if (response.body) {
      Readable.fromWeb(response.body as never).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("Proxy error");
  }
}).listen(port, () => {
  console.log(`live-proxy listening on http://*.${config.proxyDomain}`);
});
