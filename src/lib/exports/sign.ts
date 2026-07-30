import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

function computeSignature(comparisonId: string, expires: number): string {
  return createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY)
    .update(`${comparisonId}.${expires}`)
    .digest("hex");
}

export function signComparisonExport(
  comparisonId: string,
  ttlMs = 5 * 60 * 1000
): { expires: number; signature: string } {
  const expires = Date.now() + ttlMs;
  return { expires, signature: computeSignature(comparisonId, expires) };
}

export function verifyComparisonExportToken(
  comparisonId: string,
  expires: number,
  signature: string
): boolean {
  if (!Number.isFinite(expires) || expires < Date.now()) {
    return false;
  }

  const expected = Buffer.from(computeSignature(comparisonId, expires));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
