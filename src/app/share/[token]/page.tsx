import { alias } from "drizzle-orm/pg-core";
import { asc, eq, inArray } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { ScanEye } from "lucide-react";

import { getAssetSignedUrl } from "@/lib/assets/signed-url";
import { proxyOriginFor } from "@/lib/live/proxy";
import { db } from "@/lib/db";
import { annotations, assets, comments, comparisons, pages, projects, shareLinks } from "@/lib/db/schema";
import { LivePane } from "@/components/comparison/live-pane";
import { ShareThread } from "@/components/share/share-thread";

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

  // Guests get the site the same way the team does.
  let liveFrameUrl = row.comparison.liveUrl;
  if (liveFrameUrl && row.comparison.liveViaProxy) {
    const proxyOrigin = await proxyOriginFor(liveFrameUrl);
    if (proxyOrigin) {
      const url = new URL(liveFrameUrl);
      liveFrameUrl = proxyOrigin + url.pathname + url.search + url.hash;
    }
  }

  const annotationRows = await db
    .select({ annotation: annotations })
    .from(annotations)
    .innerJoin(authUsers, eq(annotations.createdBy, authUsers.id))
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
            ? `${c.comment.guestName} (guest)`
            : "Anonymous",
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Design</p>
          {designUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL
            <img src={designUrl} alt="Design" className="w-full rounded-md border border-border" />
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Live</p>
          {captureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL
            <img src={captureUrl} alt="Live" className="w-full rounded-md border border-border" />
          ) : liveFrameUrl && row.comparison.viewportWidth ? (
            <div className="h-[70vh] overflow-hidden rounded-md border border-border">
              <LivePane
                src={liveFrameUrl}
                viewportWidth={row.comparison.viewportWidth}
                mode="browse"
                pins={[]}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Pins ({threads.length})</h2>
        <div className="flex flex-col gap-3">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pins on this comparison.</p>
          ) : (
            threads.map((thread) => (
              <ShareThread
                key={thread.id}
                thread={thread}
                token={token}
                allowComments={shareLink.allowAnonymousComments}
              />
            ))
          )}
        </div>
      </div>
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
