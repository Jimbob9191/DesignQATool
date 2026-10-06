import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// Export links get their own key rather than reusing the service-role key
// as-is, so the most privileged secret isn't also doing a second, unrelated job.
// EXPORT_SIGNING_SECRET wins when set; otherwise the key is derived from the
// service-role key under a fixed label, which needs no extra configuration.
// Changing the key only breaks links already issued, and those live 5 minutes.
function signingKey(): string | Buffer {
  return (
    env.EXPORT_SIGNING_SECRET ??
    createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update("designparity:export-signing:v1").digest()
  );
}

function computeSignature(comparisonId: string, expires: number): string {
  return createHmac("sha256", signingKey())
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
