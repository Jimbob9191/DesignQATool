"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { projectFormSchema } from "@/lib/validations/project";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

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

  const { team } = await requireTeamRole("member");

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

  const { team } = await requireTeamRole("member");

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

export async function deleteProject(projectId: string): Promise<void> {
  const { team } = await requireTeamRole("admin");

  // Unfile the project's assets first. Deleting the project would also clear
  // these columns via ON DELETE SET NULL / the cascade through pages, but the
  // order those two fire in isn't something to depend on — doing it here
  // guarantees the pair is cleared together and the assets land back in the
  // team library rather than half-scoped.
  await db
    .update(assets)
    .set({ pageId: null, projectId: null })
    .where(and(eq(assets.projectId, projectId), eq(assets.teamId, team.id)));

  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.teamId, team.id)));

  revalidatePath("/projects");
}
