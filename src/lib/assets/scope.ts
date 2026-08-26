// Pure resolution of an asset's (page, project) pair. Deliberately free of
// `server-only` and of any `@/lib/db` import so the rule stays unit-testable
// under `node --test` — the database lookup that feeds `pageProjectId` lives
// in `@/lib/db/scope`, and the callers glue the two together.
export type ResolvedAssetScope = { pageId: string | null; projectId: string | null };

export type ScopeResult =
  | { ok: true; scope: ResolvedAssetScope }
  | { ok: false; error: string };

export function resolveAssetScope(input: {
  pageId: string | null;
  projectId: string | null;
  /** The page's real project, or null when the page doesn't exist in this team. */
  pageProjectId: string | null;
}): ScopeResult {
  const { pageId, projectId, pageProjectId } = input;

  if (pageId) {
    if (pageProjectId === null) {
      return { ok: false, error: "Page not found." };
    }

    // A client that names both must name them consistently; silently
    // re-filing the asset under a project the user didn't pick would be a
    // worse surprise than refusing.
    if (projectId !== null && projectId !== pageProjectId) {
      return { ok: false, error: "That page does not belong to the selected project." };
    }

    // The page wins: project_id is derived from the page's own row rather
    // than from the client, so the two columns can never drift apart even if
    // the caller sends a stale or forged projectId.
    return { ok: true, scope: { pageId, projectId: pageProjectId } };
  }

  return { ok: true, scope: { pageId: null, projectId } };
}
