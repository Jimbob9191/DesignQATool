import "server-only";

import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, per spec

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

export async function getAssetSignedUrls(
  storagePaths: string[],
  options: { thumbnail?: boolean } = {}
): Promise<Map<string, string>> {
  const thumbnail = options.thumbnail ?? true;
  const entries = await Promise.all(
    storagePaths.map(async (path) => [path, await signOne(path, thumbnail)] as const)
  );
  return new Map(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

// Full-resolution signed URL — required for the comparison viewer (pixel
// accuracy at high zoom) and anywhere else the thumbnail transform would
// silently degrade quality.
export async function getAssetSignedUrl(storagePath: string): Promise<string | null> {
  return signOne(storagePath, false);
}
