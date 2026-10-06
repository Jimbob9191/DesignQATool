// Pure helpers for moving between teams. Kept free of server-only imports so
// both the team switcher (client) and the detail pages (server) can use them,
// and so they can be unit-tested directly.

/**
 * The URL that makes `teamId` the current team and then lands on `next`.
 * Server Components can't write cookies during render, so a detail page that
 * finds its resource in another of the user's teams redirects through this
 * Route Handler instead (see src/app/switch-team/route.ts).
 */
export function switchTeamHref(teamId: string, next: string): string {
  return `/switch-team?to=${encodeURIComponent(teamId)}&next=${encodeURIComponent(next)}`;
}

/**
 * Whether the URL names something that belongs to a single team, so it would
 * 404 once a different team is selected: any project, page or comparison
 * under /projects/…, and the assets list filtered to one page. The projects
 * list itself and "?page=unassigned" are fine to keep.
 */
export function isTeamScopedPath(pathname: string, search: string): boolean {
  if (pathname.startsWith("/projects/")) return true;
  if (pathname === "/assets") {
    const page = new URLSearchParams(search).get("page");
    return Boolean(page) && page !== "unassigned";
  }
  return false;
}
