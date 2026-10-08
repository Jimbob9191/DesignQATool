import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { asc, eq, inArray } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { getAssetSignedUrl } from "@/lib/assets/signed-url";
import { FORMER_MEMBER, guestAuthor } from "@/lib/authors";
import { db } from "@/lib/db";
import { annotations, assets, comments, comparisons, pages, projects } from "@/lib/db/schema";
import { verifyComparisonExportToken } from "@/lib/exports/sign";

import { PinnedImage, type PrintPin } from "./pinned-image";

export default async function PrintComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ comparisonId: string }>;
  searchParams: Promise<{ expires?: string; sig?: string }>;
}) {
  const { comparisonId } = await params;
  const { expires, sig } = await searchParams;

  const expiresNum = Number(expires);
  if (!sig || !verifyComparisonExportToken(comparisonId, expiresNum, sig)) {
    notFound();
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
    .where(eq(comparisons.id, comparisonId))
    .limit(1);

  if (!row) {
    notFound();
  }

  const [designUrl, captureUrl] = await Promise.all([
    getAssetSignedUrl(row.design.storagePath),
    row.capture ? getAssetSignedUrl(row.capture.storagePath) : null,
  ]);

  if (!designUrl || (row.capture && !captureUrl)) {
    notFound();
  }

  const annotationRows = await db
    .select({ annotation: annotations, authorEmail: authUsers.email })
    .from(annotations)
    .leftJoin(authUsers, eq(annotations.createdBy, authUsers.id))
    .where(eq(annotations.comparisonId, comparisonId))
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

  const issues = annotationRows.map((r, index) => ({
    number: index + 1,
    status: r.annotation.status,
    target: r.annotation.target,
    xRatio: Number(r.annotation.xRatio),
    yPx: r.annotation.yPx,
    elementText: r.annotation.elementText,
    pageUrl: r.annotation.pageUrl,
    comments: commentRows
      .filter((c) => c.comment.annotationId === r.annotation.id)
      .map((c) => ({
        authorEmail: c.authorEmail ?? (c.comment.guestName ? guestAuthor(c.comment.guestName) : FORMER_MEMBER),
        body: c.comment.body,
      })),
  }));

  const designPins: PrintPin[] = issues.filter((issue) => issue.target === "design");
  const livePins: PrintPin[] = issues.filter((issue) => issue.target === "live");

  return (
    <div
      style={{
        margin: 0,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111",
        background: "#fff",
        padding: "32px 40px",
      }}
    >
      <style>{`
        @media print {
          .issue { break-inside: avoid; }
          .issues { break-before: page; }
        }
      `}</style>

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{row.comparison.name}</h1>
      <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
        {row.project.name} / {row.page.name}
      </p>

      <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>Design</p>
          <PinnedImage src={designUrl} alt="Design" height={row.design.height} pins={designPins} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>Live</p>
          {captureUrl ? (
            <PinnedImage src={captureUrl} alt="Live" height={row.capture?.height ?? null} pins={livePins} />
          ) : (
            <p style={{ fontSize: 13, color: "#555", marginTop: 0, overflowWrap: "anywhere" }}>
              Reviewed on the live site at {row.comparison.viewportWidth}px wide:{" "}
              {row.comparison.liveUrl}
              {livePins.length > 0 ? ". Its pins are listed below with the element each is attached to." : null}
            </p>
          )}
        </div>
      </div>

      <div className="issues" style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Issues ({issues.length})</h2>
        {issues.length === 0 ? (
          <p style={{ fontSize: 13, color: "#555" }}>No pins on this comparison.</p>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.number}
              className="issue"
              style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #eee" }}
            >
              <p style={{ fontSize: 14, fontWeight: "bold", margin: 0 }}>
                #{issue.number}{" "}
                <span style={{ fontWeight: "normal", fontSize: 12, color: "#555" }}>
                  ({issue.status.replace("_", " ")})
                </span>
              </p>
              <p style={{ fontSize: 12, color: "#555", marginTop: 4, marginBottom: 0, overflowWrap: "anywhere" }}>
                {issue.target === "design" ? (
                  "On the design"
                ) : (
                  <>
                    On the live site
                    {issue.elementText ? `: “${issue.elementText}”` : null}
                    {issue.pageUrl ? ` at ${issue.pageUrl}` : null}
                  </>
                )}
              </p>
              {issue.comments.length === 0 ? (
                <p style={{ fontSize: 13, color: "#777", marginTop: 4 }}>No comments.</p>
              ) : (
                issue.comments.map((comment, i) => (
                  <p key={i} style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                    <span style={{ fontWeight: "bold" }}>{comment.authorEmail}</span>
                    {": "}
                    {comment.body}
                  </p>
                ))
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
