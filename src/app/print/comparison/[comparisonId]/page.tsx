import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { asc, eq, inArray } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { getAssetSignedUrl } from "@/lib/assets/signed-url";
import { db } from "@/lib/db";
import { annotations, assets, comments, comparisons, pages, projects } from "@/lib/db/schema";
import { verifyComparisonExportToken } from "@/lib/exports/sign";

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
    .innerJoin(authUsers, eq(annotations.createdBy, authUsers.id))
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
    elementText: r.annotation.elementText,
    pageUrl: r.annotation.pageUrl,
    comments: commentRows
      .filter((c) => c.comment.annotationId === r.annotation.id)
      .map((c) => ({
        authorEmail: c.authorEmail ?? c.comment.guestName ?? "Anonymous",
        body: c.comment.body,
      })),
  }));

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
          {/* eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL fetched by Playwright, not the app UI */}
          <img
            src={designUrl}
            alt="Design"
            style={{ width: "100%", height: "auto", border: "1px solid #ddd" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>Live</p>
          {captureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL fetched by Playwright, not the app UI
            <img
              src={captureUrl}
              alt="Live"
              style={{ width: "100%", height: "auto", border: "1px solid #ddd" }}
            />
          ) : (
            <p style={{ fontSize: 13, color: "#555", marginTop: 0, wordBreak: "break-all" }}>
              Reviewed on the live site at {row.comparison.viewportWidth}px wide:{" "}
              {row.comparison.liveUrl}
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
              {issue.target === "live" && (issue.elementText || issue.pageUrl) ? (
                <p style={{ fontSize: 12, color: "#555", marginTop: 4, marginBottom: 0, wordBreak: "break-all" }}>
                  {issue.elementText ? `“${issue.elementText}”` : null}
                  {issue.elementText && issue.pageUrl ? " on " : null}
                  {issue.pageUrl}
                </p>
              ) : null}
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
