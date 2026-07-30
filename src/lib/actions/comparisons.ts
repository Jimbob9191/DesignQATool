"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, comparisons, pages, projects } from "@/lib/db/schema";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const createComparisonSchema = z.object({
  pageId: z.uuid(),
  designAssetId: z.uuid(),
  captureAssetId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function createComparison(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  const [page] = await db
    .select({ id: pages.id, projectSlug: projects.slug })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(pages.id, parsed.data.pageId), eq(projects.teamId, team.id)))
    .limit(1);
  if (!page) {
    return { success: false, error: "Page not found." };
  }

  const usedAssets = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.teamId, team.id),
        eq(assets.pageId, parsed.data.pageId)
      )
    );
  const validAssetIds = new Set(usedAssets.map((a) => a.id));
  if (
    !validAssetIds.has(parsed.data.designAssetId) ||
    !validAssetIds.has(parsed.data.captureAssetId)
  ) {
    return { success: false, error: "Selected assets do not belong to this page." };
  }

  const [comparison] = await db
    .insert(comparisons)
    .values({
      pageId: parsed.data.pageId,
      designAssetId: parsed.data.designAssetId,
      captureAssetId: parsed.data.captureAssetId,
      name: parsed.data.name,
      createdBy: user.id,
    })
    .returning({ id: comparisons.id });

  revalidatePath(`/projects/${page.projectSlug}/${parsed.data.pageId}`);
  return { success: true, data: comparison };
}

export async function deleteComparison(pageId: string, comparisonId: string): Promise<void> {
  const { team } = await requireTeamRole("member");

  const [page] = await db
    .select({ id: pages.id, projectSlug: projects.slug })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(pages.id, pageId), eq(projects.teamId, team.id)))
    .limit(1);
  if (!page) return;

  await db.delete(comparisons).where(and(eq(comparisons.id, comparisonId), eq(comparisons.pageId, pageId)));

  revalidatePath(`/projects/${page.projectSlug}/${pageId}`);
}
