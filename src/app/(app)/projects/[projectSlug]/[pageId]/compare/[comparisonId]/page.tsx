import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import { getAppOrigin } from "@/lib/app-origin";
import { assetDisplayName } from "@/lib/assets/name";
import { getAssetSignedUrls } from "@/lib/assets/signed-url";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { getCurrentUser, getCurrentTeam, redirectToOwningTeam } from "@/lib/auth/team";
import { FORMER_MEMBER, guestAuthor } from "@/lib/authors";
import { db } from "@/lib/db";
import {
  annotations,
  assets,
  captures,
  comments,
  comparisons,
  pages,
  projects,
  shareLinks,
  teamMembers,
} from "@/lib/db/schema";
import type { Rect } from "@/lib/live/protocol";
import { bridgeSnippet } from "@/lib/live/protocol";
import { proxyOriginFor } from "@/lib/live/proxy";
import { ComparisonWorkspace, type WorkspaceLiveSide } from "@/components/comparison/comparison-workspace";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { ComparisonActionsMenu } from "@/components/comparisons/comparison-actions-menu";
import { RefreshCaptureButton } from "@/components/comparisons/refresh-capture-button";

export default async function ComparisonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; pageId: string; comparisonId: string }>;
  searchParams: Promise<{ pin?: string | string[] }>;
}) {
  const { projectSlug, pageId, comparisonId } = await params;
  const { pin } = await searchParams;
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";
  const user = await getCurrentUser();

  const designAssets = alias(assets, "design_assets");
  const captureAssets = alias(assets, "capture_assets");

  const [row] = await db
    .select({
      comparison: comparisons,
      page: pages,
      project: projects,
      design: designAssets,
      capture: captureAssets,
    })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .innerJoin(designAssets, eq(comparisons.designAssetId, designAssets.id))
    .leftJoin(captureAssets, eq(comparisons.captureAssetId, captureAssets.id))
    .where(
      and(
        eq(comparisons.id, comparisonId),
        eq(pages.id, pageId),
        eq(projects.slug, projectSlug),
        eq(projects.teamId, team.id)
      )
    )
    .limit(1);

  if (!row) {
    const path = `/projects/${projectSlug}/${pageId}/compare/${comparisonId}`;
    await redirectToOwningTeam(
      { projectSlug, pageId, comparisonId },
      typeof pin === "string" ? `${path}?pin=${encodeURIComponent(pin)}` : path
    );
    notFound();
  }
  if (!row.design.width || !row.design.height || !user) {
    notFound();
  }
  const capture = row.capture;
  if (capture && (!capture.width || !capture.height)) {
    notFound();
  }

  // The row above is the team-scoped access check; everything below hangs off
  // ids it has already validated, so it can all load in parallel.
  const commentAuthor = alias(authUsers, "comment_author");
  const [
    [captureRow],
    signedUrls,
    [latestCapture],
    annotationRows,
    commentRows,
    teamMemberRows,
    shareLinkRows,
    designRows,
  ] = await Promise.all([
    capture
      ? db
          .select({ elementMap: captures.elementMap })
          .from(captures)
          .where(eq(captures.assetId, capture.id))
          .limit(1)
      : [],
    getAssetSignedUrls(capture ? [row.design.storagePath, capture.storagePath] : [row.design.storagePath], {
      thumbnail: false,
    }),
    capture
      ? db
          .select({ assetId: captures.assetId, capturedAt: captures.capturedAt })
          .from(captures)
          .innerJoin(assets, eq(captures.assetId, assets.id))
          .where(and(eq(assets.pageId, pageId), eq(captures.status, "ready")))
          .orderBy(desc(captures.createdAt))
          .limit(1)
      : [],
    db
      .select({ annotation: annotations, authorEmail: authUsers.email })
      .from(annotations)
      .leftJoin(authUsers, eq(annotations.createdBy, authUsers.id))
      .where(eq(annotations.comparisonId, comparisonId))
      .orderBy(asc(annotations.createdAt)),
    db
      .select({ comment: comments, authorEmail: commentAuthor.email })
      .from(comments)
      .innerJoin(annotations, eq(comments.annotationId, annotations.id))
      .leftJoin(commentAuthor, eq(comments.createdBy, commentAuthor.id))
      .where(eq(annotations.comparisonId, comparisonId))
      .orderBy(asc(comments.createdAt)),
    db
      .select({ userId: teamMembers.userId, email: authUsers.email })
      .from(teamMembers)
      .innerJoin(authUsers, eq(teamMembers.userId, authUsers.id))
      .where(eq(teamMembers.teamId, team.id)),
    db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.comparisonId, comparisonId))
      .orderBy(desc(shareLinks.createdAt)),
    // Any of the team's designs can be swapped in, as when creating one.
    canEdit
      ? db
          .select({ id: assets.id, name: assets.name, storagePath: assets.storagePath, width: assets.width, pageId: assets.pageId, pageName: pages.name })
          .from(assets)
          .leftJoin(pages, eq(assets.pageId, pages.id))
          .where(and(eq(assets.teamId, team.id), eq(assets.kind, "design")))
          .orderBy(desc(assets.createdAt))
      : [],
  ]);

  const designUrl = signedUrls.get(row.design.storagePath);
  const captureUrl = capture ? signedUrls.get(capture.storagePath) : undefined;

  if (!designUrl || (capture && !captureUrl)) {
    notFound();
  }

  const hasNewerCapture = capture && latestCapture && latestCapture.assetId !== capture.id;

  const initialAnnotations = annotationRows.map((r, index) => ({
    id: r.annotation.id,
    target: r.annotation.target,
    xRatio: Number(r.annotation.xRatio),
    yPx: r.annotation.yPx,
    status: r.annotation.status,
    number: index + 1,
    authorId: r.annotation.createdBy,
    authorEmail: r.authorEmail ?? FORMER_MEMBER,
    elementSelector: r.annotation.elementSelector,
    elementRect: r.annotation.elementRect as Rect | null,
    elementText: r.annotation.elementText,
    pageUrl: r.annotation.pageUrl,
    comments: commentRows
      .filter((c) => c.comment.annotationId === r.annotation.id)
      .map((c) => ({
        id: c.comment.id,
        body: c.comment.body,
        createdBy: c.comment.createdBy,
        authorEmail: c.authorEmail ?? (c.comment.guestName ? guestAuthor(c.comment.guestName) : FORMER_MEMBER),
        createdAt: c.comment.createdAt.toISOString(),
        editedAt: c.comment.editedAt?.toISOString() ?? null,
      })),
  }));

  const teamMemberOptions = teamMemberRows.map((m) => ({ id: m.userId, email: m.email ?? "unknown" }));

  // This page's designs first, then the rest of the team's.
  const designThumbnailUrls = await getAssetSignedUrls(
    designRows.map((a) => a.storagePath),
    { thumbnail: true }
  );
  const designOptions = [
    ...designRows.filter((a) => a.pageId === pageId),
    ...designRows.filter((a) => a.pageId !== pageId),
  ].map((a) => ({
    id: a.id,
    label: assetDisplayName(a),
    thumbnailUrl: designThumbnailUrls.get(a.storagePath) ?? null,
    width: a.width,
    note: a.pageId === pageId ? null : a.pageName ? `from ${a.pageName}` : "not on a page yet",
  }));

  const origin = await getAppOrigin();
  const shareLinkOptions = shareLinkRows.map((link) => ({
    id: link.id,
    url: `${origin}/share/${link.token}`,
    allowAnonymousComments: link.allowAnonymousComments,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  }));

  const live: WorkspaceLiveSide = capture
    ? {
        kind: "capture",
        image: { src: captureUrl!, width: capture.width!, height: capture.height!, label: "Live" },
        captureAssetId: capture.id,
        elementMap: (captureRow?.elementMap as ElementMapEntry[] | null) ?? [],
      }
    : {
        kind: "site",
        url: row.comparison.liveUrl!,
        viewportWidth: row.comparison.viewportWidth!,
        snippet: bridgeSnippet(origin),
        proxyOrigin: await proxyOriginFor(row.comparison.liveUrl!),
        viaProxy: row.comparison.liveViaProxy,
      };

  return (
    // Fills the window below the top bar (h-14), edge to edge: the page's p-6 is
    // cancelled so the toolbar can share the top bar's gutter.
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-[40rem] flex-col">
      <Breadcrumbs
        items={[
          { label: row.project.name, href: `/projects/${projectSlug}` },
          { label: row.page.name, href: `/projects/${projectSlug}/${pageId}` },
          { label: row.comparison.name },
        ]}
      >
        <ComparisonActionsMenu
          comparisonId={comparisonId}
          comparisonName={row.comparison.name}
          projectSlug={projectSlug}
          pageId={pageId}
          canEdit={canEdit}
          shareLinks={shareLinkOptions}
          edit={{
            current: {
              name: row.comparison.name,
              designAssetId: row.design.id,
              live: capture
                ? null
                : { url: row.comparison.liveUrl!, viewportWidth: row.comparison.viewportWidth! },
            },
            designOptions,
            designPinCount: initialAnnotations.filter((a) => a.target === "design").length,
            sitePinCount: initialAnnotations.filter((a) => a.target === "live").length,
          }}
        />
      </Breadcrumbs>
      <ComparisonWorkspace
        comparisonId={comparisonId}
        design={{
          src: designUrl,
          width: row.design.width,
          height: row.design.height,
          label: "Design",
        }}
        live={live}
        designAssetId={row.design.id}
        initialAnnotations={initialAnnotations}
        initialSelectedId={initialAnnotations.some((a) => a.id === pin) ? (pin as string) : null}
        currentUser={{ id: user.id, email: user.email ?? "unknown" }}
        teamMembers={teamMemberOptions}
        canModerate={canEdit}
        actions={
          canEdit && hasNewerCapture && latestCapture ? (
            <RefreshCaptureButton comparisonId={comparisonId} newCaptureAssetId={latestCapture.assetId} />
          ) : null
        }
      />
    </div>
  );
}
