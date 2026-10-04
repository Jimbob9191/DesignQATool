import type { SearchResults } from "@/lib/search/queries";
import { snippet, type SearchType } from "@/lib/search/text";

// One row in either the topbar dropdown or the results page. Flattening
// the four result shapes here keeps both UIs rendering the same thing.
export type SearchItem = {
  key: string;
  type: SearchType;
  href: string;
  title: string;
  context: string;
  detail: string | null;
  status?: CommentStatus;
};

type CommentStatus = SearchResults["comments"][number]["annotationStatus"];

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  projects: "Projects",
  pages: "Pages",
  comparisons: "Comparisons",
  comments: "Comments",
};

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  needs_review: "Needs review",
};

export function toSearchItems(results: SearchResults): Record<SearchType, SearchItem[]> {
  return {
    projects: results.projects.map((project) => ({
      key: `project:${project.projectId}`,
      type: "projects",
      href: `/projects/${project.projectSlug}`,
      title: project.projectName,
      context: "Project",
      detail: project.baseUrl,
    })),
    pages: results.pages.map((page) => ({
      key: `page:${page.pageId}`,
      type: "pages",
      href: `/projects/${page.projectSlug}/${page.pageId}`,
      title: page.pageName,
      context: page.projectName,
      detail: page.description ? `${page.path} · ${page.description}` : page.path,
    })),
    comparisons: results.comparisons.map((comparison) => ({
      key: `comparison:${comparison.comparisonId}`,
      type: "comparisons",
      href: `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${comparison.comparisonId}`,
      title: comparison.comparisonName,
      context: `${comparison.projectName} / ${comparison.pageName}`,
      detail: null,
    })),
    comments: results.comments.map((comment) => ({
      key: `comment:${comment.commentId}`,
      type: "comments",
      href: `/projects/${comment.projectSlug}/${comment.pageId}/compare/${comment.comparisonId}?pin=${comment.annotationId}`,
      title: snippet(comment.body, results.terms),
      context: `${comment.projectName} / ${comment.pageName} / ${comment.comparisonName}`,
      detail: comment.authorName,
      status: comment.annotationStatus,
    })),
  };
}
