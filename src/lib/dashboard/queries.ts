import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { db } from "@/lib/db";
import {
  annotations,
  assets,
  comments,
  comparisons,
  pages,
  projects,
} from "@/lib/db/schema";

export type ProjectStats = {
  id: string;
  name: string;
  slug: string;
  pageCount: number;
  comparisonCount: number;
  openCount: number;
  needsReviewCount: number;
  resolvedCount: number;
};

export async function getProjectStats(teamId: string): Promise<ProjectStats[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: annotations.status,
      count: sql<number>`count(${annotations.id})`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(pages, eq(pages.projectId, projects.id))
    .leftJoin(comparisons, eq(comparisons.pageId, pages.id))
    .leftJoin(annotations, eq(annotations.comparisonId, comparisons.id))
    .where(eq(projects.teamId, teamId))
    .groupBy(projects.id, projects.name, projects.slug, annotations.status);

  // Deliberately a second query rather than extra columns on the one above:
  // that one groups by annotation status, so a per-project distinct count
  // there would be repeated once per status and multiply when summed.
  const contentRows = await db
    .select({
      id: projects.id,
      pageCount: sql<number>`count(distinct ${pages.id})`.mapWith(Number),
      comparisonCount: sql<number>`count(distinct ${comparisons.id})`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(pages, eq(pages.projectId, projects.id))
    .leftJoin(comparisons, eq(comparisons.pageId, pages.id))
    .where(eq(projects.teamId, teamId))
    .groupBy(projects.id);

  const contentByProject = new Map(contentRows.map((row) => [row.id, row]));

  const byProject = new Map<string, ProjectStats>();
  for (const row of rows) {
    if (!byProject.has(row.id)) {
      const content = contentByProject.get(row.id);
      byProject.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        pageCount: content?.pageCount ?? 0,
        comparisonCount: content?.comparisonCount ?? 0,
        openCount: 0,
        needsReviewCount: 0,
        resolvedCount: 0,
      });
    }
    const stats = byProject.get(row.id)!;
    if (row.status === "open") stats.openCount += row.count;
    else if (row.status === "needs_review") stats.needsReviewCount += row.count;
    else if (row.status === "resolved") stats.resolvedCount += row.count;
  }

  return Array.from(byProject.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type ProjectComparison = {
  id: string;
  name: string;
  createdAt: Date;
  pageId: string;
  pageName: string;
  designStoragePath: string;
};

// Every comparison in the project, newest first — the project page is the only
// place they can be seen without knowing which page they were made under.
export async function getProjectComparisons(
  projectId: string,
  limit = 20
): Promise<ProjectComparison[]> {
  return db
    .select({
      id: comparisons.id,
      name: comparisons.name,
      createdAt: comparisons.createdAt,
      pageId: pages.id,
      pageName: pages.name,
      designStoragePath: assets.storagePath,
    })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(assets, eq(comparisons.designAssetId, assets.id))
    .where(eq(pages.projectId, projectId))
    .orderBy(desc(comparisons.createdAt))
    .limit(limit);
}

export type PageStats = { pageId: string; openCount: number; resolvedCount: number };

export async function getPageStatsForProject(projectId: string): Promise<Map<string, PageStats>> {
  const rows = await db
    .select({
      pageId: pages.id,
      status: annotations.status,
      count: sql<number>`count(${annotations.id})`.mapWith(Number),
    })
    .from(pages)
    .leftJoin(comparisons, eq(comparisons.pageId, pages.id))
    .leftJoin(annotations, eq(annotations.comparisonId, comparisons.id))
    .where(eq(pages.projectId, projectId))
    .groupBy(pages.id, annotations.status);

  const byPage = new Map<string, PageStats>();
  for (const row of rows) {
    if (!byPage.has(row.pageId)) {
      byPage.set(row.pageId, { pageId: row.pageId, openCount: 0, resolvedCount: 0 });
    }
    const stats = byPage.get(row.pageId)!;
    if (row.status === "open" || row.status === "needs_review") stats.openCount += row.count;
    else if (row.status === "resolved") stats.resolvedCount += row.count;
  }
  return byPage;
}

export type NeedsAttentionItem = {
  annotationId: string;
  comparisonId: string;
  pageId: string;
  projectSlug: string;
  projectName: string;
  pageName: string;
  comparisonName: string;
  status: "open" | "needs_review";
  createdAt: Date;
};

export async function getNeedsAttention(teamId: string, limit = 10): Promise<NeedsAttentionItem[]> {
  const rows = await db
    .select({
      annotationId: annotations.id,
      comparisonId: comparisons.id,
      pageId: pages.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      pageName: pages.name,
      comparisonName: comparisons.name,
      status: annotations.status,
      createdAt: annotations.createdAt,
    })
    .from(annotations)
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(
      and(
        eq(projects.teamId, teamId),
        sql`${annotations.status} in ('open', 'needs_review')`
      )
    )
    .orderBy(desc(annotations.createdAt))
    .limit(limit);

  return rows as NeedsAttentionItem[];
}

export type ActivityItem =
  | { type: "comment"; id: string; body: string; authorEmail: string; createdAt: Date; comparisonId: string; pageId: string; projectSlug: string; pageName: string }
  | { type: "annotation"; id: string; authorEmail: string; createdAt: Date; comparisonId: string; pageId: string; projectSlug: string; pageName: string }
  | { type: "comparison"; id: string; name: string; authorEmail: string; createdAt: Date; pageId: string; projectSlug: string; pageName: string };

export async function getActivityFeed(teamId: string, limit = 15): Promise<ActivityItem[]> {
  const commentAuthor = authUsers;

  const recentComments = await db
    .select({
      id: comments.id,
      body: comments.body,
      authorEmail: commentAuthor.email,
      guestName: comments.guestName,
      createdAt: comments.createdAt,
      comparisonId: annotations.comparisonId,
      pageId: pages.id,
      projectSlug: projects.slug,
      pageName: pages.name,
    })
    .from(comments)
    .leftJoin(commentAuthor, eq(comments.createdBy, commentAuthor.id))
    .innerJoin(annotations, eq(comments.annotationId, annotations.id))
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  const recentAnnotations = await db
    .select({
      id: annotations.id,
      authorEmail: authUsers.email,
      createdAt: annotations.createdAt,
      comparisonId: annotations.comparisonId,
      pageId: pages.id,
      projectSlug: projects.slug,
      pageName: pages.name,
    })
    .from(annotations)
    .innerJoin(authUsers, eq(annotations.createdBy, authUsers.id))
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(annotations.createdAt))
    .limit(limit);

  const recentComparisons = await db
    .select({
      id: comparisons.id,
      name: comparisons.name,
      authorEmail: authUsers.email,
      createdAt: comparisons.createdAt,
      pageId: pages.id,
      projectSlug: projects.slug,
      pageName: pages.name,
    })
    .from(comparisons)
    .innerJoin(authUsers, eq(comparisons.createdBy, authUsers.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(comparisons.createdAt))
    .limit(limit);

  const merged: ActivityItem[] = [
    ...recentComments.map((r) => ({
      type: "comment" as const,
      ...r,
      authorEmail: r.authorEmail ?? r.guestName ?? "Anonymous",
    })),
    ...recentAnnotations.map((r) => ({ type: "annotation" as const, ...r, authorEmail: r.authorEmail ?? "unknown" })),
    ...recentComparisons.map((r) => ({ type: "comparison" as const, ...r, authorEmail: r.authorEmail ?? "unknown" })),
  ];

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, limit);
}
