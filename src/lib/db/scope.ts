import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { pages, projects } from "@/lib/db/schema";

// Team-scoped lookups shared by every action that has to prove a page or a
// project belongs to the caller's team before writing to it. Both return null
// rather than throwing so callers can map the miss onto their own
// ActionResult error string (or ignore it, as the delete paths do).

export type PageScope = { pageId: string; projectId: string; projectSlug: string };

export async function findPageInTeam(pageId: string, teamId: string): Promise<PageScope | null> {
  const [page] = await db
    .select({ id: pages.id, projectId: pages.projectId, projectSlug: projects.slug })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(pages.id, pageId), eq(projects.teamId, teamId)))
    .limit(1);

  if (!page) return null;
  return { pageId: page.id, projectId: page.projectId, projectSlug: page.projectSlug };
}

export type ProjectScope = { projectId: string; slug: string };

export async function findProjectInTeam(
  projectId: string,
  teamId: string
): Promise<ProjectScope | null> {
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.teamId, teamId)))
    .limit(1);

  if (!project) return null;
  return { projectId: project.id, slug: project.slug };
}
