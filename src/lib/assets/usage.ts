import { inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { comparisons } from "@/lib/db/schema";

/**
 * Names of the comparisons built on each asset, keyed by asset id. Deleting
 * an asset cascades to these comparisons (and their pins and comments), so
 * the delete dialog needs them to warn the user. One query for the whole
 * list rather than one per card.
 */
export async function getAssetComparisonNames(assetIds: string[]): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  if (assetIds.length === 0) return usage;

  const rows = await db
    .select({
      name: comparisons.name,
      designAssetId: comparisons.designAssetId,
      captureAssetId: comparisons.captureAssetId,
    })
    .from(comparisons)
    .where(or(inArray(comparisons.designAssetId, assetIds), inArray(comparisons.captureAssetId, assetIds)))
    .orderBy(comparisons.name);

  for (const row of rows) {
    // A comparison could in principle use one asset as both design and
    // capture; count it once.
    for (const assetId of new Set([row.designAssetId, row.captureAssetId])) {
      if (!assetId) continue;
      const names = usage.get(assetId);
      if (names) names.push(row.name);
      else usage.set(assetId, [row.name]);
    }
  }
  return usage;
}
