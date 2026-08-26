// Decides whether a (design, capture) pair may be compared on a given page.
// Deliberately free of `server-only` and of any `@/lib/db` import so the rule
// stays unit-testable under `node --test` — the caller fetches the two
// candidate rows and glues the two halves together.
//
// The asymmetry between the two sides is the point: a design may sit in the
// project library and get filed onto the page on first use, because that is
// how designers actually work (upload once, compare on several pages). A
// capture is produced *by* a page and means nothing away from it, so it stays
// strictly page-bound.
export type AssetScopeRow = {
  id: string;
  kind: "design" | "capture";
  pageId: string | null;
  projectId: string | null;
};

export type EligibilityResult =
  | { ok: true; designNeedsPageAssignment: boolean }
  | { ok: false; error: string };

const CAPTURE_ERROR = "That capture doesn't belong to this page.";

export function checkComparisonAssets(input: {
  pageId: string;
  projectId: string;
  designAssetId: string;
  captureAssetId: string;
  /** Already filtered to the caller's team; may be short, or empty. */
  candidates: AssetScopeRow[];
}): EligibilityResult {
  const { pageId, projectId, designAssetId, captureAssetId, candidates } = input;

  const design = candidates.find((row) => row.id === designAssetId);
  if (!design) {
    return { ok: false, error: "That design upload isn't in your team's library." };
  }
  if (design.kind !== "design") {
    return { ok: false, error: "Select a design upload, not a capture." };
  }

  // Either already filed on this page, or unfiled but sitting in this page's
  // project. A design filed on a *different* page is out, even a sibling page
  // in the same project — moving it would silently unfile it from there.
  const onThisPage = design.pageId === pageId;
  const inProjectLibrary = design.pageId === null && design.projectId === projectId;
  if (!onThisPage && !inProjectLibrary) {
    return { ok: false, error: "That design belongs to a different page." };
  }

  const capture = candidates.find((row) => row.id === captureAssetId);
  if (!capture || capture.kind !== "capture" || capture.pageId !== pageId) {
    return { ok: false, error: CAPTURE_ERROR };
  }

  return { ok: true, designNeedsPageAssignment: design.pageId === null };
}
