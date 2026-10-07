# DesignParity.app — to-do list

Generated 2026-10-04 from a full scan of the repo (app, `capture-service/`, `live-proxy/`, migrations, tests).
Baseline at the time: `npx tsc --noEmit`, `npm run lint` and `npm test` (42 tests) all pass.

## How to use this file

- Each task is written so **one agent can pick it up cold and finish it alone**. Claim one by changing `[ ]` to `[~]` and finish by changing it to `[x]`.
- **Priority**: P1 = bug, data loss or security · P2 = a real improvement users will notice · P3 = polish, tooling, or tidying.
- **Size**: S ≈ under an hour · M ≈ half a day · L ≈ a day or more.
- **Touches** lists the main files. Don't run two tasks in parallel if their *Touches* overlap. Where it matters, *Conflicts/depends* says so outright.
- 🗄️ = adds a database migration. **Only run one 🗄️ task at a time**, because drizzle numbers migrations sequentially and parallel branches will collide in `drizzle/meta/_journal.json`. Change the schema in `src/lib/db/schema/*`, then `npm run db:generate`. Never apply a migration to the production database without asking the user first.
- Before you call a task done, run `npx tsc --noEmit && npm run lint && npm test`. **Don't run `next build` in a workspace where a dev server is running** (it corrupts `.next`). To see the app, use the Conductor `dev` run script (and `proxy` for live-proxy).
- Match the surrounding code style. The codebase comments the *why* in full sentences and uses `ActionResult` objects (not exceptions) for expected failures.

---

## P1 — bugs, data loss, security

Nothing open.

---

## P2 — real improvements

### [ ] 9. 🗄️ Keep the original filename of uploads (and allow renaming)
**P2 · M · Touches:** `src/lib/db/schema/assets.ts`, migration, `src/lib/actions/assets.ts`, `src/lib/validations/asset.ts`, `src/components/assets/asset-card.tsx`, `src/components/comparisons/create-comparison-dialog.tsx`, `src/app/(app)/projects/[projectSlug]/[pageId]/page.tsx`, `src/lib/search/*` (optional)

**Problem:** `requestUploadUrl` receives `filename`, but nothing stores it (`assets.ts:43-73`). Storage paths are `<team>/<uuid>.png`, so asset cards and the "New comparison" design picker label everything with a UUID (`asset-card.tsx:42`, `[pageId]/page.tsx:86,92`). On a real project, picking the right design is guesswork.

**Do:** add a nullable `name text` column (max 255). Save the trimmed original filename in `confirmUpload`, and fall back to the storage basename for old rows. Show `name` everywhere a filename is shown today. Add a "Rename" action on the asset card (member+). Optionally show a thumbnail next to each option in the comparison design picker.

**Done when:** newly uploaded designs show their real filenames in the assets grid, the page detail, and the comparison picker.

---

### [ ] 10. Delete pins, and set every pin status from the sidebar
**P2 · S–M · Touches:** `src/components/comments/comment-sidebar.tsx`, `src/components/comparison/comparison-workspace.tsx`, `src/lib/actions/annotations.ts`

**Problem:** `deleteAnnotation` exists but nothing calls it, so a misplaced pin can't be removed. The sidebar only toggles open/resolved (`comment-sidebar.tsx:119-135`), even though the data model also has `wont_fix` and `needs_review`. "Needs review" pins (from re-resolution) can only be cleared by resolving them.

**Do:** add a small per-thread menu (`DropdownMenu`) for members and up: set the status to any of the four values, and "Delete pin" behind a confirm. Allow the pin's author to delete their own pin even as a viewer, if that fits the role model; otherwise members+ only. Use the same server-side rule. Update the workspace state optimistically and roll back on error.

**Done when:** pins can be deleted and moved to any status, and other viewers see the change live (task 4 handles delete sync).

---

### [ ] 11. Edit an existing comparison
**P2 · M · Touches:** `src/lib/actions/comparisons.ts`, new `src/components/comparisons/edit-comparison-dialog.tsx` (or generalise `create-comparison-dialog.tsx`), compare page header

**Problem:** Once a comparison is created, its name, live URL and viewport width can't be changed, and neither can the design it's set against. The only fix is to delete it, which loses every pin and comment.

**Do:** add `updateComparison(comparisonId, input)` with the same validation as create and a team-scoped check. Add an "Edit" button (member+) next to "Delete comparison". Changing the design or viewport moves design-pane pins. Either warn in the dialog, or only allow swapping to a design of the same width.

**Done when:** all four fields can be edited, and the page revalidates.

---

### [ ] 12. Team settings: rename and delete a team
**P2 · M · Touches:** `src/lib/actions/teams.ts`, `src/app/(app)/team/page.tsx`, new team-settings component

**Problem:** Teams can be created but never renamed or deleted (there's no action for either). A mistyped team name is permanent.

**Do:** add `renameTeam` (admin+) and `deleteTeam` (owner only, confirm by typing the team name). Deleting must also remove the team's storage objects (`<teamId>/…` in the `assets` bucket, listed and removed through the admin client), because the DB cascade only deletes rows. Don't allow deleting the user's last remaining team (or the personal team, if that's the intended model; check the signup trigger in `drizzle/0001_personal_team_on_signup.sql`). After deleting, clear `current_team_id` and redirect to `/dashboard`.

**Done when:** an owner can rename and delete a team, and no orphaned storage objects are left behind.

---

### [ ] 13. Account settings: change password and delete account
**P2 · M · Touches:** `src/app/(app)/settings/page.tsx`, `src/lib/actions/auth.ts` (or a new `account.ts`), new settings components

**Conflicts/depends:** none. Task 2 (keep shared content when a user is deleted) is done: authored content survives as "Former member".

**Problem:** Settings only has notification toggles. Changing your password means going through "forgot password", and there's no way to delete an account.

**Do:**
- **Change password:** current password plus new password and confirm. Verify the current password with `signInWithPassword` before calling `updateUser`, and rate-limit it like sign-in. Reuse `resetPasswordSchema`'s rules.
- **Delete account:** confirm by typing your email. Refuse while you're the sole owner of a team that has other members (tell them to transfer ownership first). Then delete teams where you're the only member (reusing task 12's storage cleanup if it's done), delete the auth user through the admin client, sign out, and redirect to `/login`.

**Done when:** both flows work end to end locally, with clear errors.

---

### [ ] 14. Invitations: resend, and copy the invite link
**P2 · S · Touches:** `src/lib/actions/invitations.ts`, `src/components/team/invitation-row.tsx`

**Problem:** If an invite email bounces or gets lost, the only way to recover is to revoke it and re-invite. The UI also hides the invite link, so admins can't paste it into Slack.

**Do:** add `resendInvitation(id)` (admin+). It should extend `expiresAt` and resend the email, counted against the same rate limits as `inviteMember`. Add "Resend" and "Copy link" buttons to each pending invitation row, and show when each invite expires.

**Done when:** an admin can resend an invite or copy its link from `/team`.

---

### [ ] 15. Deep-link to the pin from notifications and the dashboard
**P2 · S · Touches:** `src/lib/notifications/notify.ts`, `src/app/(app)/dashboard/page.tsx`

**Problem:** The compare page already opens a specific pin from `?pin=<annotationId>`, but notification emails (`notify.ts:98`) and the dashboard's "Needs attention" and "Activity" links (`dashboard/page.tsx:98`, `:134`) don't use it. Users land on the comparison and have to hunt for the thread. Also:
- the pin's author isn't notified of replies unless they've commented on it themselves;
- notification failures are swallowed without any logging (`notify.ts:127`);
- preferences are fetched once per recipient (N queries).

**Do:** append `?pin=` to all three link types (for activity items, only those tied to a pin). Add the annotation's `created_by` to the reply recipients. `console.error` inside the catch. Fetch preferences for all recipients in one `inArray` query.

**Done when:** clicking any of those links opens the comparison with the right thread selected.

---

### [ ] 16. Show pins on the shared (guest) view
**P2 · M · Touches:** `src/app/share/[token]/page.tsx`, `src/components/share/share-thread.tsx`, possibly a small read-only pin overlay component

**Problem:** The share page lists threads as "Pin #3", but never shows *where* the pins are: the design is a plain `<img>` (`share/page.tsx:121`), and the live pane gets `pins={[]}` (`:135`). Guests can't tell what a comment refers to.

**Do:** draw numbered `PinMarker`s over the design image using `xRatio`/`yPx`, as an absolutely positioned overlay scaled to the rendered image width. Pass the live pins into `LivePane`; `pinAnchorFor` from `src/lib/live/anchor.ts` builds the anchors. Clicking a pin should scroll to its thread, and vice versa. Make it read-only: no dragging.

**Done when:** a guest can see each numbered pin on both sides and jump between pins and threads.

---

### [ ] 17. Make the PDF export useful for live comparisons
**P2 · M · Touches:** `src/app/print/comparison/[comparisonId]/page.tsx`, `src/lib/actions/export.ts`, `src/components/comparisons/export-pdf-button.tsx`, optionally a new route handler

**Problem:** For live-site comparisons (the default now), the PDF contains the design image and a sentence with the URL (`print/page.tsx:132-137`). There are no pins on the design and no indication of where issues are, so the PDF is mostly a list of comments. The PDF also comes back to the browser as base64 inside a Server Action response, which inflates the payload by about 33% and buffers it entirely in memory.

**Do:** overlay numbered pins on the design image in the print page (same math as task 16; share a component if 16 is done). For live pins, list element text and page URL (already there) next to the number. Move the download to a `GET /api/export/[comparisonId]` route handler that authorises the user, calls capture-service, and streams `application/pdf` with `Content-Disposition`. Change the button to a plain link/fetch.

**Conflicts/depends:** shares `export.ts` with task 8. Do it after that, or rebase.

**Done when:** exported PDFs show numbered pins on the design, and the download is a streamed response.

---

### [ ] 18. Wrap multi-step writes in transactions
**P2 · S–M · Touches:** `src/lib/actions/{teams,invitations,comparisons,annotations}.ts`

**Problem:** A failure halfway through leaves inconsistent data:
- `createTeam` inserts the team, then the owner membership, as two statements (`teams.ts:53-54`). If the second fails, the team is left with no members. Its slug loop also gives up after 20 tries and inserts a taken slug anyway, which hits a unique-violation crash.
- `acceptInvitation` inserts the membership, then marks the invite accepted, separately (`invitations.ts:158-165`). Two concurrent accepts can both pass the checks.
- `createComparison` moves the asset onto the page, then inserts the comparison, separately (`comparisons.ts:64-78`).
- `refreshComparisonCapture` runs one UPDATE per pin in a loop with no transaction (`annotations.ts:265-296`), unless task 25 deletes it.

**Do:** use `db.transaction`. In `acceptInvitation`, lock the row with `UPDATE … WHERE status = 'pending' RETURNING` so only one accept wins. For team slugs, fall back to a short random suffix and retry on a `23505` unique violation.

**Done when:** each flow is atomic, and `createTeam` can't crash on a slug collision.

---

### [ ] 19. Error and 404 pages; remove the dev test harness
**P2 · S · Touches:** new `src/app/(app)/error.tsx`, `src/app/(app)/not-found.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`; delete `src/app/(app)/dev-test/` and `public/test/*.svg`

**Problem:** The app has no `error.tsx` or `not-found.tsx` anywhere. Any thrown error shows Next's bare default page, outside the app shell, with no way back. Separately, `/dev-test/comparison` (a manual harness from the original build phases) ships to production and any signed-in user can reach it.

**Do:**
- Add an app-shell error boundary with "Try again" (`reset()`) and "Back to dashboard".
- Add a friendly 404 inside the shell, a root 404, and a minimal `global-error.tsx`.
- Delete the dev-test route and its two SVG fixtures, after checking with grep that nothing else uses them.

**Done when:** a thrown error or unknown project slug renders inside the app shell with a way back, and `/dev-test/comparison` is gone.

---

### [ ] 20. Page titles, and noindex on share and print pages
**P2 · S · Touches:** root `layout.tsx` metadata, every `page.tsx` under `src/app`

**Problem:** Every tab is titled "DesignParity.app" (only the root layout sets metadata), so several open comparisons are indistinguishable in the tab bar and browser history. Public share pages (`/share/[token]`) and the print route don't send `noindex`, so a share link posted publicly can end up in search results.

**Do:** set a `title.template` of `"%s · DesignParity.app"` in the root layout. Add `metadata` or `generateMetadata` per page: project name, page name, comparison name, "Team", and so on. Keep these lookups cheap by reusing the page's existing team-scoped query through React `cache()`. On the share and print pages, set `robots: { index: false, follow: false }`, and add `referrer: "no-referrer"` on share.

**Done when:** each route has a meaningful title, and share and print pages carry noindex.

---

### [ ] 21. Team switcher is missing on mobile
**P2 · S · Touches:** `src/components/app-shell/topbar.tsx`, `src/app/(app)/layout.tsx`

**Problem:** Below `md`, the sidebar (and the `TeamSwitcher` inside it) is hidden. The mobile sheet only shows `NavLinks` (`topbar.tsx:35-47`), so mobile users can't switch or create teams.

**Do:** pass `currentTeamId` and `teams` down to `Topbar`, and render `TeamSwitcher` at the top of the sheet. Close the sheet after a switch.

**Conflicts/depends:** touches `team-switcher.tsx` only if task 3 changes its API. Coordinate with 3, or do this after it.

**Done when:** you can switch teams from the mobile menu.

---

### [ ] 22. Responsive comparison workspace
**P2 · M–L · Touches:** `src/components/comparison/comparison-workspace.tsx`, `src/components/comments/comment-sidebar.tsx`, `src/components/comparison/live-comparison-viewer.tsx`, compare page header

**Problem:** The comparison view assumes a wide desktop. The comment sidebar is a fixed `w-80` beside the viewer (`comment-sidebar.tsx:68`), both panes are `h-[70vh]`, and the header packs up to five buttons into one row. On a laptop at 1280px with the app sidebar open, the viewer is cramped. On a tablet it's unusable.

**Do:**
- Below `xl`, move the comment sidebar into a toggleable `Sheet` (right side), with the pin count on its trigger.
- Let the viewer use the full height available (`calc(100dvh - header)`) instead of `70vh`.
- Collapse the secondary header actions (Export, Delete, Share) into an overflow menu on narrow widths.
- Default to the "Single" layout on narrow screens.

**Conflicts/depends:** shares files with tasks 4, 10, 33 and 34. Don't run them in parallel.

**Done when:** the view is usable at 1024px and at 768px.

---

### [ ] 23. Harden and polish the upload flow
**P2 · S–M · Touches:** `src/lib/actions/assets.ts`, `src/components/assets/upload-dropzone.tsx`

**Problem:**
- `confirmUpload` trusts the client completely (`assets.ts:75-118`). It never checks that the object actually exists in storage, and the `mime`, `width` and `height` it records are whatever the client says. A client can register an asset row for a file that was never uploaded.
- Each signed upload URL creates a storage object before `confirmUpload` runs. Abandoned uploads leave orphaned objects behind.
- In the dropzone, the "done" entries pile up forever, and error rows use `key={i}`.
- There's no paste-from-clipboard support, which is the fastest way to bring in a Figma export.

**Do:**
- In `confirmUpload`, check the object exists using the admin client's `storage.from(bucket).info()` or `list()` on the path, and refuse if it's missing. If a cheap check is possible (e.g. object metadata), verify the content type too.
- Clear finished uploads after a few seconds, and give each upload an id to use as its key.
- Add a document-level `paste` listener on pages that render the dropzone. Pasted images get the same upload path, with a generated filename such as `pasted-2026-10-04-1532.png`.
- Optional: a short note in the README about cleaning up orphaned objects, or a small admin script.

**Done when:** confirming a non-existent path fails, and pasting an image uploads it.

---

### [ ] 24. Live proxy: use the Public Suffix List to group hosts
**P2 · S–M · Touches:** `live-proxy/src/handler.ts`, `live-proxy/package.json`, `tests/live-proxy.test.mjs`

**Problem:** `siteOf()` approximates registrable domains with a hard-coded list of about 20 suffixes (`handler.ts:61-73`). On shared hosting suffixes, `acme.vercel.app`, `acme.netlify.app`, `acme.github.io`, `acme.pages.dev` and `acme.webflow.io` all collapse to the platform domain, so the proxy will mint labels for, and rewrite links to, *any other customer's site* on that platform. Staging sites usually live on exactly these domains.

**Do:** replace `siteOf` with a PSL-backed lookup that includes the PRIVATE section, using `tldts` (it works in Workers and Node; check bundle size for the Worker). Keep the function signature. Extend the tests to cover `vercel.app`, `github.io`, `co.uk` and plain `.com`.

**Done when:** `siteOf("acme.vercel.app") === "acme.vercel.app"`, the tests pass, and `cd live-proxy && npm run typecheck` passes.

---

## P3 — polish, tooling, cleanup

### [ ] 25. Remove the dead screenshot-capture pipeline
**P3 · M · Touches:** `capture-service/src/{server,capture,browser-scripts,image-fit}.ts`, `tests/webp-fit.test.mjs`, `src/lib/actions/annotations.ts` (`refreshComparisonCapture`), `src/components/comparisons/refresh-capture-button.tsx`, compare page, `README.md`

**Problem:** The README says the app no longer calls capture-service's `/capture`. No new captures can be created anymore, so the "Refresh capture" button and `refreshComparisonCapture` only ever act on legacy data. That leaves a lot of unused code to maintain: the screenshot code, the WebP fitting and its tests, element-map building, and the refresh/re-resolve flow.

**Do:**
- Delete `/capture`, `runCapture`, and the helpers only it uses. Keep `/pdf`, `getBrowser` and `url-guard` if the PDF path still needs them (check).
- Remove `RefreshCaptureButton`, `refreshComparisonCapture`, and the `latestCapture` / `hasNewerCapture` query on the compare page. Delete `src/lib/annotations/resolve.ts` if nothing else uses it.
- **Keep** the legacy image viewer, `hit-test.ts`, and the `captures` table: old comparisons must still open.
- Update the README.

**Done when:** grep shows no references to the removed code, legacy comparisons still open, and `capture-service` builds (`npm run build`).

---

### [ ] 26. Add CI (GitHub Actions)
**P3 · S · Touches:** new `.github/workflows/ci.yml`, maybe `package.json`

**Problem:** There's no CI at all (no `.github/`). Lint, typecheck and tests only run when someone remembers to, and `live-proxy` and `capture-service` are never typechecked.

**Do:** add a workflow on PRs and pushes to `main` with Node 22 and an npm cache. It should run `npm ci`, `npx tsc --noEmit`, `npm run lint` and `npm test`, then `npm run typecheck` in `live-proxy`, then `npm ci && npm run build` in `capture-service`. Set `SKIP_ENV_VALIDATION=true` wherever env validation would otherwise fail. While you're there, silence the `MODULE_TYPELESS_PACKAGE_JSON` warning that `npm test` prints: rename the imported TS helpers, or pass `--experimental-default-type=module` in the test script. Don't flip the root package to `"type": "module"` without checking Next and PostCSS configs.

**Done when:** the workflow is green on a PR.

---

### [ ] 27. Unit tests for the pure logic that has none
**P3 · M · Touches:** new files in `tests/`

**Problem:** Tests only cover auth helpers, search text, proxy labels and WebP fitting. The trickiest pure logic has no tests:
- `src/lib/live/anchor.ts` (pin anchoring);
- `src/lib/live/protocol.ts` (`samePage`, `isBridgeMessage`);
- `src/lib/live/viewports.ts` (`guessViewportWidth` with @2x/@3x exports);
- `src/lib/annotations/hit-test.ts`;
- `src/lib/slug.ts`;
- `src/lib/auth/form-state.ts` `friendlyAuthError` edge cases.

**Do:** add `node:test` files in the same style as `tests/search.test.mjs`. If a module imports `@/…` aliases or `server-only`, make the minimal change needed to import it: relative imports in that pure module, as `email/templates.ts` already does.

**Done when:** the new tests pass under `npm test`, and each module has meaningful edge-case coverage.

---

### [ ] 28. Rewrite the README intro and add local setup
**P3 · S · Touches:** `README.md`

**Problem:** The top and bottom of the README are still `create-next-app` boilerplate ("bootstrapped with…", "start editing `app/page.tsx`", "Learn More", "Deploy on Vercel"). There's no description of what the product is, and no local-setup steps: Supabase project, `.env.local`, running migrations (`npm run db:migrate`), seeding a user.

**Do:** replace the boilerplate with a short product description, prerequisites, a step-by-step local setup (env vars from `.env.example`, migrations, `npm run dev`, the Conductor run scripts), and the test/lint commands. Keep the existing Email / Live site / Proxy / PDF sections as they are.

**Done when:** a new developer could get the app running from the README alone.

---

### [ ] 29. Patch- and minor-level dependency updates
**P3 · S · Touches:** `package.json`, `package-lock.json`

**Problem:** `npm outdated` lists in-range updates for `@supabase/supabase-js` (2.111 → 2.117), `@supabase/ssr`, `react` / `react-dom` (19.2 → 19.3), `zod` (4.4 → 4.6), `resend` (6.18 → 6.32), `lucide-react`, `react-hook-form`, `drizzle-orm` (0.45.2 → 0.45.3) and others.

**Do:** run `npm update` within the existing ranges. Don't do major bumps here; Next 16 is task 30. Run typecheck, lint and tests, then click through sign-in, a comparison, and an upload in the dev server.

**Done when:** the lockfile is updated and all checks pass.

---

### [ ] 30. Upgrade to Next.js 16 (clears the open `npm audit` advisory)
**P3 · L · Touches:** `package.json`, `next.config.ts`, `src/middleware.ts`, anything that breaks

**Problem:** `npm audit` reports a **high-severity** PostCSS advisory (XSS through unescaped `</style>`, and source-map path traversal) bundled inside `next@15.5.x`. The fix is only in `next@16`, together with `eslint-config-next@16`. Real-world exposure is low, since this is build-time CSS processing of our own files, but it will keep showing up in audits.

**Do:** follow the official Next 16 upgrade guide and codemods. Watch for: middleware → `proxy.ts` renames if they apply, async request APIs (already in use), caching defaults, and `unstable_cache` usage in `src/lib/assets/signed-url.ts`. Check every route by hand in the dev server.

**Done when:** you're on Next 16, `npm audit --omit=dev` is clean, and every route works.

---

### [ ] 31. Real Content-Security-Policy for the app
**P3 · M · Touches:** `next.config.ts` and/or `src/middleware.ts`

**Problem:** The only CSP directive is `frame-ancestors 'none'` (`next.config.ts:6`). There's no `script-src`, `connect-src` or `img-src`, so an XSS anywhere would run unrestricted. It matters more than usual here: the app frames arbitrary third-party sites and renders user-supplied text everywhere.

**Do:** add a nonce-based CSP through middleware, following the Next docs pattern. It needs: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `connect-src 'self'` plus the Supabase URL and its `wss:` realtime endpoint, `img-src 'self' data: blob:` plus the Supabase storage host, `frame-src https: http://localhost:* http://*.localhost:*` plus the proxy domain, `style-src 'self' 'unsafe-inline'` (Tailwind and inline styles), and `frame-ancestors 'none'`. **Keep `bridge.js` excluded** from middleware (it already is). Ship it as `Content-Security-Policy-Report-Only` first, then enforce.

**Done when:** the app works with no CSP violations in the console under the enforced policy.

---

### [ ] 32. Breadcrumbs and page actions on the page-detail view
**P3 · S · Touches:** `src/app/(app)/projects/[projectSlug]/[pageId]/page.tsx`, `src/app/(app)/projects/[projectSlug]/[pageId]/compare/[comparisonId]/page.tsx`, new `src/components/app-shell/breadcrumbs.tsx`

**Problem:** The page-detail view has no link back to its project and no edit or delete for the page (`[pageId]/page.tsx:106-110`). Those actions only exist in the project's table row menu. The compare page has a bare back arrow with no context.

**Do:** add a small breadcrumb component (Projects / {project} / {page} / {comparison}) to both views. Add `Edit page` and `Delete page` to the page-detail header for members, reusing `PageFormDialog` and `DeletePageButton`.

**Done when:** you can navigate up from any detail view, and manage a page from its own screen.

---

### [ ] 33. Remember viewer preferences
**P3 · S · Touches:** `src/components/comparison/live-comparison-viewer.tsx` (and `comparison-viewer.tsx` for the legacy viewer)

**Problem:** Layout (side-by-side, stacked, overlay…), sync lock, split position, overlay opacity and the difference toggle all reset on every visit (`live-comparison-viewer.tsx:88-103`). Reviewers who always use Overlay at 60% have to set it up again every time.

**Do:** persist those values to `localStorage`, keyed globally rather than per comparison. Use a small `usePersistentState` hook that reads after mount, to avoid hydration mismatches. Leave the filters (status, author) unpersisted.

**Done when:** the layout and overlay settings survive a reload.

---

### [ ] 34. Comment sidebar polish and accessibility
**P3 · S · Touches:** `src/components/comments/comment-sidebar.tsx`, `src/components/comments/comment-item.tsx`

**Problem:**
- The empty state says "Click either image to drop a pin" (`comment-sidebar.tsx:77`), which is wrong for live comparisons, where you click an element on the site in Comment mode.
- Thread rows are clickable `div`s (`:85-95`) with no `role`, `tabIndex` or keyboard handling, so keyboard users can't select a thread.
- Deleting a comment happens instantly with no confirmation (`comment-item.tsx:102-108`).
- Timestamps use `toLocaleString()` in full. A relative time ("5m ago") with the full date in `title` reads better; the dashboard already has a `timeAgo` you could move into `src/lib/`.

**Do:** fix all four. Give rows `role="button"`, `tabIndex={0}` and Enter/Space handlers, or restructure them around a real `<button>` header.

**Conflicts/depends:** overlaps with tasks 10 and 22 on `comment-sidebar.tsx`.

**Done when:** the copy is right for both comparison kinds, threads work from the keyboard, and deleting a comment asks first.

---

### [ ] 35. Paginate the assets page
**P3 · S–M · Touches:** `src/app/(app)/assets/page.tsx`, `src/components/assets/asset-filters.tsx`

**Problem:** `/assets` loads **every** team asset and signs a URL for each one on every request (`assets/page.tsx:39-48`). That's fine at 30 assets and slow at 1,000.

**Do:** add cursor or offset pagination (e.g. 48 per page, `?cursor=`), with "Load more" or numbered pages, and keep the existing filters working. Only sign URLs for the visible page.

**Done when:** the page renders a bounded number of assets and its queries are limited.

---

### [ ] 36. Share-link dialog: show the link's settings, confirm before revoking, hide expired links
**P3 · S · Touches:** `src/components/comparisons/share-link-dialog.tsx`, compare page (the share-link query)

**Problem:** Existing links are listed as bare URLs. You can't tell which ones allow anonymous comments or when they expire, expired links are still listed, and revoking happens instantly with no confirmation and no error handling (`share-link-dialog.tsx:62-66`, `:81-92`). After creating a link, the new URL isn't selected or copied, so you have to find it in the list.

**Do:** show "Comments on/off · Expires in 6 days / Expired / Never" on each link, and sort expired links last (muted) or hide them. Confirm before revoking. Copy the new link to the clipboard on create and say so in the toast.

**Done when:** a user can tell their links apart, and can't revoke one by accident.
