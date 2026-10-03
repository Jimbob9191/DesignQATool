import type { NextConfig } from "next";

const securityHeaders = [
  // Nothing in the app is meant to be embedded; refusing frames stops
  // clickjacking (e.g. tricking a signed-in admin into clicking "Remove").
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Share and invite URLs carry their token in the path/query; only send our
  // origin, never the full URL, to other sites (e.g. Supabase image hosts).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
