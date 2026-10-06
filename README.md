This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Email

All email is sent by the app through [Resend](https://resend.com) (`src/lib/email/`), including the auth emails — signup confirmation and password reset links are minted with Supabase's admin `generateLink()` and delivered by Resend, so Supabase's built-in SMTP is never used. Templates live in `src/lib/email/templates.ts`.

| Email | Trigger |
| --- | --- |
| Confirm your account | Signing up with an email address (signing up again with an unconfirmed address resends it). The password is chosen after the link is opened, so nobody can pre-set one for an address they don't own |
| Reset your password | `/forgot-password` |
| Team invitation | Inviting someone from `/team` |
| Mention / reply | Comment notifications (respecting each user's preferences) |

### Setup

1. **Verify a sending domain in Resend** — Resend dashboard → Domains → Add domain, then add the SPF/DKIM (and ideally DMARC) DNS records it shows and wait for it to verify. A subdomain such as `mail.yourdomain.com` keeps app mail reputation separate from your main domain.
2. **Create an API key** — Resend dashboard → API Keys, with "Sending access" restricted to that domain.
3. **Set the env vars** (see `.env.example`) locally and in your hosting provider:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` — e.g. `DesignParity.app <no-reply@mail.yourdomain.com>`; must be on the verified domain
   - `EMAIL_REPLY_TO` (optional)
   - `NEXT_PUBLIC_SITE_URL` — the real public URL; every emailed link is built from it
4. **Supabase → Authentication → Sign In / Providers → Email**: keep **Confirm email** enabled so unconfirmed accounts can't sign in with their password.
5. *(Optional)* **Supabase → Authentication → Emails → SMTP Settings**: point Supabase at Resend's SMTP (`smtp.resend.com`, port `465`, user `resend`, password = an API key, sender = your `EMAIL_FROM` address). The app doesn't rely on this, but it means anything Supabase sends itself — e.g. users invited from the Supabase dashboard — also delivers reliably instead of hitting the built-in sender's tight rate limit.

Without `RESEND_API_KEY`, nothing is sent; in development the would-be email, including its link, is printed to the `next dev` console so signup and reset can still be completed locally.

## Live site comparisons

A comparison puts a design upload next to the real site, framed live in the reviewer's browser at the viewport width the design was made for. Scrolling either side scrolls both, and Overlay/Swipe lay the design over the running site. Pins go on real page elements — stored by selector, element text and position within the element — so they follow the element as the page changes; one that can't be found is drawn dashed where it last was.

The page talks to the app through `public/bridge.js` (protocol: `src/lib/live/protocol.ts`), which gets onto the page one of two ways — switchable per comparison from the viewer, for the whole team:

- **Preview proxy (default, no setup).** `live-proxy/` serves the site from its own subdomain, `<label>.LIVE_PROXY_DOMAIN`, where the label is the site's host plus a signature (`src/lib/live/proxy-label.ts`) so only sites someone set up a comparison for can be proxied. Paths stay identical, so client-side routers keep working. It drops the headers that block framing, adds the bridge and a small runtime to every page (keeping links, API calls and "back to our own domain" redirects on the proxy), rewrites the site's absolute URLs, and only lets the app frame its pages. Sites needing a sign-in, or that detect proxies, may not work — the viewer offers a switch to Direct.
- **Direct (needs the snippet).** The site is framed as-is and must include `<script src="https://www.designparity.app/bridge.js" async></script>` (staging or localhost is fine) and allow being framed (no `X-Frame-Options: DENY` / restrictive CSP `frame-ancestors`). From the https app only https sites, or `http://localhost`, can be framed. The snippet does nothing unless the page is framed by the app origin it was loaded from.

Comparisons made from screenshots before this still open in the old image viewer.

### The preview proxy

It's a Cloudflare Worker (`live-proxy/src/worker.ts`) on a domain of its own — **not** a subdomain of the app's, since proxied sites run their own scripts there. Setup:

1. Register a domain for it on Cloudflare (e.g. via Cloudflare Registrar) and add a proxied (orange-cloud) wildcard DNS record `*` pointing anywhere (e.g. `AAAA 100::`).
2. Put the domain into `live-proxy/wrangler.toml` (`PROXY_DOMAIN`, the route and its zone).
3. `cd live-proxy && npx wrangler secret put PROXY_SECRET` and `npx wrangler deploy`.
4. In Vercel set `LIVE_PROXY_DOMAIN` (the domain) and `LIVE_PROXY_SECRET` (same value as `PROXY_SECRET`), then redeploy.

Without those two variables the app only offers Direct. Locally, `live-proxy/src/dev-server.ts` runs the same handler over plain http on `*.proxy.localhost:8788` (browsers resolve any `*.localhost` to this machine): set `LIVE_PROXY_DOMAIN=proxy.localhost:8788` and a `LIVE_PROXY_SECRET` in `.env.local` and start the Conductor "proxy" run script, or `cd live-proxy && APP_ORIGINS=http://localhost:3000 node --env-file=../.env.local src/dev-server.ts`.

## PDF export service

PDF exports come from `capture-service/`, a small Fastify + Playwright (Chromium) server (it also still has the old screenshot `/capture` endpoint, which the app no longer calls). The app calls it with `CAPTURE_SERVICE_URL` and authenticates with a shared bearer token, `CAPTURE_SERVICE_SECRET`; without them, export fails with "Export is not configured."

The service renders the app's `/print/comparison/…` page from a signed URL that's valid for 5 minutes. The signing key is derived from `SUPABASE_SERVICE_ROLE_KEY`, or comes from the optional `EXPORT_SIGNING_SECRET` (32+ characters) when that's set. Changing either one only breaks exports that are already running.

It runs on **Google Cloud Run** (project `designparity-capture`, region `us-east4`), scaled to zero when idle so normal usage stays inside the free tier. A £1/month budget alert on the project emails the billing owner if that ever changes. To redeploy after changing it:

```bash
cd capture-service
gcloud run deploy capture-service --source . --project designparity-capture --region us-east4
```

Settings (2 vCPU, 2 GiB, concurrency 2, 90s timeout, 0–3 instances) and the secret persist between deploys.

Locally: `cd capture-service && npm install && npx playwright install chromium`, put `CAPTURE_SERVICE_SECRET=<anything>` in `capture-service/.env.local`, run `npm run dev` (port 8787), and point the app's `.env.local` at `CAPTURE_SERVICE_URL=http://localhost:8787` with the same secret.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
