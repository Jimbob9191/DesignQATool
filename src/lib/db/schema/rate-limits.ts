import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Fixed-window counters behind src/lib/rate-limit.ts. Lives in Postgres
// rather than memory because serverless instances don't share state, so a
// per-instance counter would let an attacker spread requests across them.
//
// RLS is enabled with no policies on purpose: only the server's `db` client
// (which bypasses RLS) ever touches this table.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(1),
}).enableRLS();
