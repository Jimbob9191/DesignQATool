import "server-only";

import { and, asc, desc, eq, ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { db } from "@/lib/db";
import { annotations, comments, comparisons, pages, projects } from "@/lib/db/schema";
import { escapeLike, tokenize, type SearchType } from "@/lib/search/text";

export type ProjectSearchResult = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  baseUrl: string | null;
};

export type PageSearchResult = {
  pageId: string;
  projectSlug: string;
  projectName: string;
  pageName: string;
  path: string;
  description: string | null;
};

export type ComparisonSearchResult = {
  comparisonId: string;
  comparisonName: string;
  pageId: string;
  pageName: string;
  projectSlug: string;
  projectName: string;
  createdAt: Date;
};

export type CommentSearchResult = {
  commentId: string;
  annotationId: string;
  annotationStatus: "open" | "resolved" | "wont_fix" | "needs_review";
  comparisonId: string;
  comparisonName: string;
  pageId: string;
  pageName: string;
  projectSlug: string;
  projectName: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
};

export type SearchResults = {
  query: string;
  terms: string[];
  projects: ProjectSearchResult[];
  pages: PageSearchResult[];
  comparisons: ComparisonSearchResult[];
  comments: CommentSearchResult[];
};

// Every term must appear in at least one of `own` or `context`, and at
// least one term must hit `own`. `context` holds the parents' names, so
// "acme pricing" finds Acme's Pricing page, but "acme" alone doesn't list
// every page in the Acme project (the project itself covers that).
function matchTerms(terms: string[], own: AnyColumn[], context: AnyColumn[] = []): SQL | undefined {
  const anyOf = (columns: AnyColumn[], term: string) =>
    or(...columns.map((column) => ilike(column, `%${escapeLike(term)}%`)));

  return and(
    ...terms.map((term) => anyOf([...own, ...context], term)),
    or(...terms.map((term) => anyOf(own, term)))
  );
}

// Exact name first, then prefix, then anything else; ties fall back to the
// caller's secondary ordering.
function nameRank(column: AnyColumn, query: string): SQL<number> {
  const escaped = escapeLike(query);
  return sql<number>`case
    when ${column} ilike ${escaped} then 0
    when ${column} ilike ${`${escaped}%`} then 1
    when ${column} ilike ${`%${escaped}%`} then 2
    else 3 end`;
}

async function searchProjects(teamId: string, query: string, terms: string[], limit: number) {
  return db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      baseUrl: projects.baseUrl,
    })
    .from(projects)
    .where(and(eq(projects.teamId, teamId), matchTerms(terms, [projects.name, projects.slug, projects.baseUrl])))
    .orderBy(nameRank(projects.name, query), asc(projects.name))
    .limit(limit);
}

async function searchPages(teamId: string, query: string, terms: string[], limit: number) {
  return db
    .select({
      pageId: pages.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      pageName: pages.name,
      path: pages.path,
      description: pages.description,
    })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(
      and(
        eq(projects.teamId, teamId),
        matchTerms(terms, [pages.name, pages.path, pages.description], [projects.name])
      )
    )
    .orderBy(nameRank(pages.name, query), desc(pages.createdAt))
    .limit(limit);
}

async function searchComparisons(teamId: string, query: string, terms: string[], limit: number) {
  return db
    .select({
      comparisonId: comparisons.id,
      comparisonName: comparisons.name,
      pageId: pages.id,
      pageName: pages.name,
      projectSlug: projects.slug,
      projectName: projects.name,
      createdAt: comparisons.createdAt,
    })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(
      and(
        eq(projects.teamId, teamId),
        matchTerms(terms, [comparisons.name], [pages.name, projects.name])
      )
    )
    .orderBy(nameRank(comparisons.name, query), desc(comparisons.createdAt))
    .limit(limit);
}

async function searchComments(teamId: string, terms: string[], limit: number) {
  const rows = await db
    .select({
      commentId: comments.id,
      annotationId: comments.annotationId,
      annotationStatus: annotations.status,
      comparisonId: comparisons.id,
      comparisonName: comparisons.name,
      pageId: pages.id,
      pageName: pages.name,
      projectSlug: projects.slug,
      projectName: projects.name,
      body: comments.body,
      authorEmail: authUsers.email,
      guestName: comments.guestName,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(annotations, eq(comments.annotationId, annotations.id))
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .leftJoin(authUsers, eq(comments.createdBy, authUsers.id))
    .where(and(eq(projects.teamId, teamId), matchTerms(terms, [comments.body])))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  return rows.map(({ authorEmail, guestName, ...row }) => ({
    ...row,
    authorName: authorEmail ?? guestName,
  }));
}

// Searches everything the team owns. `only` narrows to one result type
// (the results page's filter tabs); the others come back empty.
export async function searchTeam(
  teamId: string,
  rawQuery: string,
  { limit = 8, only }: { limit?: number; only?: SearchType } = {}
): Promise<SearchResults> {
  const terms = tokenize(rawQuery);
  const query = terms.join(" ");
  const empty: SearchResults = { query, terms, projects: [], pages: [], comparisons: [], comments: [] };
  if (terms.length === 0) return empty;

  const want = (type: SearchType) => !only || only === type;
  const [projectRows, pageRows, comparisonRows, commentRows] = await Promise.all([
    want("projects") ? searchProjects(teamId, query, terms, limit) : [],
    want("pages") ? searchPages(teamId, query, terms, limit) : [],
    want("comparisons") ? searchComparisons(teamId, query, terms, limit) : [],
    want("comments") ? searchComments(teamId, terms, limit) : [],
  ]);

  return {
    ...empty,
    projects: projectRows,
    pages: pageRows,
    comparisons: comparisonRows,
    comments: commentRows,
  };
}
