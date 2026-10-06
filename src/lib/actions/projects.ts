"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { projectFormSchema } from "@/lib/validations/project";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function createProject(
  input: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  try {
    const [project] = await db
      .insert(projects)
      .values({
        teamId: team.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        baseUrl: parsed.data.baseUrl || null,
      })
      .returning({ id: projects.id, slug: projects.slug });

    revalidatePath("/projects");
    return { success: true, data: project };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "A project with this slug already exists." };
    }
    throw error;
  }
}

export async function updateProject(
  projectId: string,
  input: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isUuid(projectId)) return { success: false, error: "Project not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  try {
    const [project] = await db
      .update(projects)
      .set({
        name: parsed.data.name,
        slug: parsed.data.slug,
        baseUrl: parsed.data.baseUrl || null,
      })
      .where(and(eq(projects.id, projectId), eq(projects.teamId, team.id)))
      .returning({ id: projects.id, slug: projects.slug });

    if (!project) {
      return { success: false, error: "Project not found." };
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${project.slug}`);
    return { success: true, data: project };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "A project with this slug already exists." };
    }
    throw error;
  }
}

export async function deleteProject(projectId: string): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(projectId)) return { success: false, error: "Project not found." };

  const auth = await authorizeTeamRole("admin");
  if (!auth.success) return auth;

  const [project] = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.teamId, auth.data.team.id)))
    .returning({ id: projects.id });

  if (!project) {
    return { success: false, error: "Project not found." };
  }

  revalidatePath("/projects");
  return { success: true, data: project };
}
