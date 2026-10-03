import "server-only";

import { headers } from "next/headers";
import { lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Counts one hit against `key` and reports whether it's still within `limit`
 * hits per `windowSeconds`. A single upsert, so concurrent requests can't
 * both read a stale count and slip through together.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const expired = sql`${rateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds})`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${expired} then now() else ${rateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: rateLimits.count });

  // Keys are per-IP/per-email, so the table only grows; prune stale windows
  // now and then instead of running a separate cron for it.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStartedAt, sql`now() - interval '1 day'`));
  }

  return row.count <= limit;
}

/**
 * Runs every check (so each one counts the hit) and passes only if all do.
 * Each entry is [key, limit, windowSeconds].
 */
export async function consumeRateLimits(
  checks: [key: string, limit: number, windowSeconds: number][]
): Promise<boolean> {
  const results = await Promise.all(checks.map((check) => consumeRateLimit(...check)));
  return results.every(Boolean);
}

/**
 * The caller's IP. On Vercel both headers are set by the edge network itself
 * (any client-sent values are overwritten), so they can't be spoofed there.
 */
export async function clientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get("x-real-ip") ??
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
