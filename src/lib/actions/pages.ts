"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { db } from "@/lib/db";
import { pages, projects } from "@/lib/db/schema";
import { pageFormSchema } from "@/lib/validations/page";

async function findProjectInTeam(projectId: string, teamId: string) {
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.teamId, teamId)))
    .limit(1);
  return project ?? null;
}

export async function createPage(
  projectId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = pageFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isUuid(projectId)) return { success: false, error: "Project not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const project = await findProjectInTeam(projectId, auth.data.team.id);
  if (!project) return { success: false, error: "Project not found." };

  const [page] = await db
    .insert(pages)
    .values({
      projectId,
      name: parsed.data.name,
      path: parsed.data.path,
      description: parsed.data.description || null,
    })
    .returning({ id: pages.id });

  revalidatePath(`/projects/${project.slug}`);
  return { success: true, data: page };
}

export async function updatePage(
  projectId: string,
  pageId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = pageFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isUuid(projectId, pageId)) return { success: false, error: "Page not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const project = await findProjectInTeam(projectId, auth.data.team.id);
  if (!project) return { success: false, error: "Project not found." };

  const [page] = await db
    .update(pages)
    .set({
      name: parsed.data.name,
      path: parsed.data.path,
      description: parsed.data.description || null,
    })
    .where(and(eq(pages.id, pageId), eq(pages.projectId, projectId)))
    .returning({ id: pages.id });

  if (!page) {
    return { success: false, error: "Page not found." };
  }

  revalidatePath(`/projects/${project.slug}`);
  return { success: true, data: page };
}

export async function deletePage(
  projectId: string,
  pageId: string
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(projectId, pageId)) return { success: false, error: "Page not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const project = await findProjectInTeam(projectId, auth.data.team.id);
  if (!project) return { success: false, error: "Project not found." };

  const [page] = await db
    .delete(pages)
    .where(and(eq(pages.id, pageId), eq(pages.projectId, projectId)))
    .returning({ id: pages.id });

  if (!page) {
    return { success: false, error: "Page not found." };
  }

  revalidatePath(`/projects/${project.slug}`);
  return { success: true, data: page };
}
