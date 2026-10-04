import { handleProxyRequest, type ProxyConfig } from "./handler.ts";

type Env = {
  PROXY_DOMAIN: string;
  /** Comma-separated; the first serves bridge.js. */
  APP_ORIGINS: string;
  /** Same value as the app's LIVE_PROXY_SECRET (`wrangler secret put PROXY_SECRET`). */
  PROXY_SECRET: string;
};

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    const config: ProxyConfig = {
      proxyDomain: env.PROXY_DOMAIN,
      proxyScheme: "https",
      secret: env.PROXY_SECRET,
      appOrigins: env.APP_ORIGINS.split(",").map((origin) => origin.trim()),
    };
    return handleProxyRequest(request, config);
  },
};

export default worker;
