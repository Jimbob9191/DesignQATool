import { alias } from "drizzle-orm/pg-core";
import { asc, eq, inArray } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { ScanEye } from "lucide-react";

import { getAssetSignedUrl } from "@/lib/assets/signed-url";
import { pinAnchorFor } from "@/lib/live/anchor";
import type { Rect } from "@/lib/live/protocol";
import { proxyOriginFor } from "@/lib/live/proxy";
import { FORMER_MEMBER, guestAuthor } from "@/lib/authors";
import { db } from "@/lib/db";
import { annotations, assets, comments, comparisons, pages, projects, shareLinks } from "@/lib/db/schema";
import { SharedComparison, type ShareLiveSide, type SharePin } from "@/components/share/shared-comparison";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [shareLink] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);

  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) {
    return (
      <ShareMessage title="Link not available" description="This share link is invalid or has expired." />
    );
  }

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
    .where(eq(comparisons.id, shareLink.comparisonId))
    .limit(1);

  if (!row) {
    return <ShareMessage title="Not found" description="This comparison no longer exists." />;
  }

  const [designUrl, captureUrl] = await Promise.all([
    getAssetSignedUrl(row.design.storagePath),
    row.capture ? getAssetSignedUrl(row.capture.storagePath) : null,
  ]);

  const { liveUrl, viewportWidth } = row.comparison;
  const live: ShareLiveSide | null = captureUrl
    ? {
        kind: "capture",
        image: { src: captureUrl, width: row.capture?.width ?? null, height: row.capture?.height ?? null },
      }
    : liveUrl && viewportWidth
      ? {
          kind: "site",
          url: liveUrl,
          viewportWidth,
          // Guests get the site the same way the team does.
          proxyOrigin: row.comparison.liveViaProxy ? await proxyOriginFor(liveUrl) : null,
        }
      : null;

  const annotationRows = await db
    .select({ annotation: annotations })
    .from(annotations)
    .where(eq(annotations.comparisonId, shareLink.comparisonId))
    .orderBy(asc(annotations.createdAt));

  const annotationIds = annotationRows.map((r) => r.annotation.id);
  const commentAuthor = alias(authUsers, "comment_author");
  const commentRows =
    annotationIds.length === 0
      ? []
      : await db
          .select({ comment: comments, authorEmail: commentAuthor.email })
          .from(comments)
          .leftJoin(commentAuthor, eq(comments.createdBy, commentAuthor.id))
          .where(inArray(comments.annotationId, annotationIds))
          .orderBy(asc(comments.createdAt));

  const pins: SharePin[] = annotationRows.map(({ annotation: a }, index) => {
    const xRatio = Number(a.xRatio);
    return {
      id: a.id,
      number: index + 1,
      status: a.status,
      target: a.target,
      xRatio,
      yPx: a.yPx,
      pageUrl: a.pageUrl,
      anchor:
        a.target === "live" && live?.kind === "site"
          ? pinAnchorFor(
              {
                id: a.id,
                xRatio,
                yPx: a.yPx,
                elementSelector: a.elementSelector,
                elementRect: a.elementRect as Rect | null,
                elementText: a.elementText,
              },
              live.viewportWidth
            )
          : null,
    };
  });

  const threads = annotationRows.map((r, index) => ({
    id: r.annotation.id,
    number: index + 1,
    status: r.annotation.status,
    comments: commentRows
      .filter((c) => c.comment.annotationId === r.annotation.id)
      .map((c) => ({
        id: c.comment.id,
        body: c.comment.body,
        // Anyone with the link can read this page, so team members appear by
        // the name part of their address only — never a full, contactable
        // email. Guests are labelled so they can't pass as a team member.
        authorName: c.authorEmail
          ? c.authorEmail.split("@")[0]
          : c.comment.guestName
            ? guestAuthor(c.comment.guestName)
            : FORMER_MEMBER,
        createdAt: c.comment.createdAt.toISOString(),
      })),
  }));

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ScanEye className="h-4 w-4" />
        DesignParity.app — shared read-only view
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{row.comparison.name}</h1>
        <p className="text-sm text-muted-foreground">
          {row.project.name} / {row.page.name}
        </p>
      </div>

      <SharedComparison
        design={designUrl ? { src: designUrl, width: row.design.width, height: row.design.height } : null}
        live={live}
        pins={pins}
        threads={threads}
        token={token}
        allowComments={shareLink.allowAnonymousComments}
      />
    </div>
  );
}

function ShareMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
