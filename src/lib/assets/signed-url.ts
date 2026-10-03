import "server-only";

import { unstable_cache } from "next/cache";

import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";

// Signed URLs are reused for up to an hour so the browser can cache the
// images (a fresh token means a fresh URL, which forces a re-download on
// every visit) and pages skip the Storage round trip. Each URL is signed for
// two hours, so whatever a page receives is still valid for at least the
// 1 hour the spec asks for.
const SIGNED_URL_REUSE_SECONDS = 60 * 60;
const SIGNED_URL_TTL_SECONDS = SIGNED_URL_REUSE_SECONDS + 60 * 60;

async function signOne(storagePath: string, thumbnail: boolean): Promise<string | null> {
  const admin = createAdminClient();

  if (thumbnail) {
    // Image transformations require a Supabase plan that supports them —
    // fall back to an untransformed signed URL below (still satisfies "1hr
    // signed URLs"; the grid just renders the full image sized down via CSS).
    const transformed = await admin.storage
      .from(ASSETS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
        transform: { width: 400, height: 400, resize: "contain" },
      });
    if (!transformed.error && transformed.data) {
      return transformed.data.signedUrl;
    }
  }

  const plain = await admin.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return plain.data?.signedUrl ?? null;
}

// The reuse window is part of the cache key, so an entry is only ever served
// within the window it was signed in — never after its URL has expired.
const signOneCached = unstable_cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only read as part of the cache key
  async (storagePath: string, thumbnail: boolean, _window: number) => {
    const url = await signOne(storagePath, thumbnail);
    // Throwing keeps failures out of the cache so the next request retries.
    if (!url) throw new Error(`Could not sign ${storagePath}`);
    return url;
  },
  ["asset-signed-url"],
  { revalidate: SIGNED_URL_REUSE_SECONDS }
);

async function signCached(storagePath: string, thumbnail: boolean): Promise<string | null> {
  const window = Math.floor(Date.now() / (SIGNED_URL_REUSE_SECONDS * 1000));
  return signOneCached(storagePath, thumbnail, window).catch(() => null);
}

export async function getAssetSignedUrls(
  storagePaths: string[],
  options: { thumbnail?: boolean } = {}
): Promise<Map<string, string>> {
  const thumbnail = options.thumbnail ?? true;
  const entries = await Promise.all(
    storagePaths.map(async (path) => [path, await signCached(path, thumbnail)] as const)
  );
  return new Map(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

// Full-resolution signed URL — required for the comparison viewer (pixel
// accuracy at high zoom) and anywhere else the thumbnail transform would
// silently degrade quality.
export async function getAssetSignedUrl(storagePath: string): Promise<string | null> {
  return signCached(storagePath, false);
}
