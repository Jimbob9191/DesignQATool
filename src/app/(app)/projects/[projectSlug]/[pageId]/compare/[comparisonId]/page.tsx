import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ArrowLeft } from "lucide-react";

import { getAssetSignedUrls } from "@/lib/assets/signed-url";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { getCurrentUser, getCurrentTeam } from "@/lib/auth/team";
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
import { env } from "@/lib/env";
import type { Rect } from "@/lib/live/protocol";
import { bridgeSnippet } from "@/lib/live/protocol";
import { proxyOriginFor } from "@/lib/live/proxy";
import { Button } from "@/components/ui/button";
import { ComparisonWorkspace, type WorkspaceLiveSide } from "@/components/comparison/comparison-workspace";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { ExportPdfButton } from "@/components/comparisons/export-pdf-button";
import { RefreshCaptureButton } from "@/components/comparisons/refresh-capture-button";
import { ShareLinkDialog } from "@/components/comparisons/share-link-dialog";
import { Share2 } from "lucide-react";

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ projectSlug: string; pageId: string; comparisonId: string }>;
}) {
  const { projectSlug, pageId, comparisonId } = await params;
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";
  const user = await getCurrentUser();

  const designAssets = alias(assets, "design_assets");
  const captureAssets = alias(assets, "capture_assets");

  const [row] = await db
    .select({
      comparison: comparisons,
      page: pages,
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

  if (!row || !row.design.width || !row.design.height || !user) {
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
      .innerJoin(authUsers, eq(annotations.createdBy, authUsers.id))
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
    authorEmail: r.authorEmail ?? "unknown",
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
        authorEmail: c.authorEmail ?? c.comment.guestName ?? "Anonymous",
        createdAt: c.comment.createdAt.toISOString(),
        editedAt: c.comment.editedAt?.toISOString() ?? null,
      })),
  }));

  const teamMemberOptions = teamMemberRows.map((m) => ({ id: m.userId, email: m.email ?? "unknown" }));

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol =
    headersList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : env.NEXT_PUBLIC_SITE_URL;
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectSlug}/${pageId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{row.comparison.name}</h1>
            <p className="text-sm text-muted-foreground">{row.page.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && hasNewerCapture && latestCapture ? (
            <RefreshCaptureButton comparisonId={comparisonId} newCaptureAssetId={latestCapture.assetId} />
          ) : null}
          {canEdit ? (
            <ShareLinkDialog
              comparisonId={comparisonId}
              existingLinks={shareLinkOptions}
              trigger={
                <Button variant="outline">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              }
            />
          ) : null}
          <ExportPdfButton comparisonId={comparisonId} comparisonName={row.comparison.name} />
          {canEdit ? (
            <DeleteComparisonButton
              projectSlug={projectSlug}
              pageId={pageId}
              comparisonId={comparisonId}
              comparisonName={row.comparison.name}
              trigger={<Button variant="outline">Delete comparison</Button>}
            />
          ) : null}
        </div>
      </div>

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
        currentUser={{ id: user.id, email: user.email ?? "unknown" }}
        teamMembers={teamMemberOptions}
        canModerate={canEdit}
      />
    </div>
  );
}
