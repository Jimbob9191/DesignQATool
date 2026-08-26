"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { findProjectInTeam, type ProjectScope } from "@/lib/db/scope";
import { pageFormSchema } from "@/lib/validations/page";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// Throwing wrapper over the shared lookup: every caller below treats a
// missing project as a bug rather than a user-facing error, so the throw
// stays here instead of leaking a null into the action bodies.
async function assertProjectInTeam(projectId: string, teamId: string): Promise<ProjectScope> {
  const project = await findProjectInTeam(projectId, teamId);
  if (!project) {
    throw new Error("Project not found.");
  }
  return project;
}

export async function createPage(
  projectId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = pageFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");
  const project = await assertProjectInTeam(projectId, team.id);

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

  const { team } = await requireTeamRole("member");
  const project = await assertProjectInTeam(projectId, team.id);

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

export async function deletePage(projectId: string, pageId: string): Promise<void> {
  const { team } = await requireTeamRole("member");
  const project = await assertProjectInTeam(projectId, team.id);

  await db.delete(pages).where(and(eq(pages.id, pageId), eq(pages.projectId, projectId)));

  revalidatePath(`/projects/${project.slug}`);
}
