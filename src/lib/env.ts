import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    CAPTURE_SERVICE_URL: z.string().url().optional(),
    CAPTURE_SERVICE_SECRET: z.string().min(1).optional(),
    // Signs the short-lived PDF export URLs. Unset derives a key from
    // SUPABASE_SERVICE_ROLE_KEY, so it's only needed to rotate it separately.
    EXPORT_SIGNING_SECRET: z.string().min(32).optional(),
    // Live-preview proxy (live-proxy/): the domain sites are served from as
    // <label>.LIVE_PROXY_DOMAIN, and the secret labels are signed with. Unset
    // means comparisons can only frame sites directly, via the snippet.
    LIVE_PROXY_DOMAIN: z.string().min(1).optional(),
    LIVE_PROXY_SECRET: z.string().min(16).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    // "Name <address>" on a domain verified in Resend. Unset falls back to
    // Resend's sandbox sender, which only delivers to the account owner.
    EMAIL_FROM: z.string().min(1).optional(),
    EMAIL_REPLY_TO: z.string().email().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" || process.env.NODE_ENV === "test",
});
