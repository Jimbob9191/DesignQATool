import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { annotations, comments, comparisons, pages, projects } from "@/lib/db/schema";

export type PageSearchResult = {
  type: "page";
  pageId: string;
  projectSlug: string;
  projectName: string;
  pageName: string;
  description: string | null;
};

export type CommentSearchResult = {
  type: "comment";
  commentId: string;
  annotationId: string;
  comparisonId: string;
  pageId: string;
  projectSlug: string;
  projectName: string;
  pageName: string;
  body: string;
  createdAt: Date;
};

export async function searchPages(teamId: string, query: string, limit = 20): Promise<PageSearchResult[]> {
  const pattern = `%${query}%`;
  const rows = await db
    .select({
      pageId: pages.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      pageName: pages.name,
      description: pages.description,
    })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(
      and(
        eq(projects.teamId, teamId),
        or(ilike(pages.name, pattern), ilike(pages.description, pattern))
      )
    )
    .orderBy(desc(pages.createdAt))
    .limit(limit);

  return rows.map((row) => ({ type: "page" as const, ...row }));
}

export async function searchComments(teamId: string, query: string, limit = 20): Promise<CommentSearchResult[]> {
  const pattern = `%${query}%`;
  const rows = await db
    .select({
      commentId: comments.id,
      annotationId: comments.annotationId,
      comparisonId: annotations.comparisonId,
      pageId: pages.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      pageName: pages.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(annotations, eq(comments.annotationId, annotations.id))
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(projects.teamId, teamId), ilike(comments.body, pattern)))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  return rows.map((row) => ({ type: "comment" as const, ...row }));
}
