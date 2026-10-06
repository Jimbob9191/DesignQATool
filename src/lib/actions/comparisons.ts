"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { getCurrentUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, comparisons, pages, projects } from "@/lib/db/schema";
import { MAX_VIEWPORT_WIDTH, MIN_VIEWPORT_WIDTH } from "@/lib/live/viewports";

const createComparisonSchema = z.object({
  pageId: z.uuid(),
  designAssetId: z.uuid(),
  // Framed in the reviewer's own browser, so localhost and private staging
  // hosts are fine here — only the scheme is restricted.
  liveUrl: z.url({ protocol: /^https?$/, error: "Enter the site's full http(s) URL" }).max(2000),
  viewportWidth: z.number().int().min(MIN_VIEWPORT_WIDTH).max(MAX_VIEWPORT_WIDTH),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function createComparison(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;
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

  // Any of the team's designs; one that isn't on a page yet joins this one.
  const [designAsset] = await db
    .select({ id: assets.id, pageId: assets.pageId })
    .from(assets)
    .where(
      and(
        eq(assets.id, parsed.data.designAssetId),
        eq(assets.teamId, team.id),
        eq(assets.kind, "design")
      )
    )
    .limit(1);
  if (!designAsset) {
    return { success: false, error: "That design isn't one of your team's uploads." };
  }
  if (!designAsset.pageId) {
    await db.update(assets).set({ pageId: parsed.data.pageId }).where(eq(assets.id, designAsset.id));
  }

  const [comparison] = await db
    .insert(comparisons)
    .values({
      pageId: parsed.data.pageId,
      designAssetId: parsed.data.designAssetId,
      liveUrl: parsed.data.liveUrl,
      viewportWidth: parsed.data.viewportWidth,
      name: parsed.data.name,
      createdBy: user.id,
    })
    .returning({ id: comparisons.id });

  revalidatePath(`/projects/${page.projectSlug}/${parsed.data.pageId}`);
  return { success: true, data: comparison };
}

export async function deleteComparison(
  pageId: string,
  comparisonId: string
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(pageId, comparisonId)) return { success: false, error: "Comparison not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;

  const [page] = await db
    .select({ id: pages.id, projectSlug: projects.slug })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(pages.id, pageId), eq(projects.teamId, auth.data.team.id)))
    .limit(1);
  if (!page) return { success: false, error: "Page not found." };

  const [comparison] = await db
    .delete(comparisons)
    .where(and(eq(comparisons.id, comparisonId), eq(comparisons.pageId, pageId)))
    .returning({ id: comparisons.id });
  if (!comparison) return { success: false, error: "Comparison not found." };

  revalidatePath(`/projects/${page.projectSlug}/${pageId}`);
  return { success: true, data: comparison };
}

/** Switches a live comparison between the proxy and loading the site directly. */
export async function setComparisonViaProxy(
  comparisonId: string,
  viaProxy: boolean
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ comparisonId: z.uuid(), viaProxy: z.boolean() }).safeParse({ comparisonId, viaProxy });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [row] = await db
    .select({ id: comparisons.id, pageId: comparisons.pageId, projectSlug: projects.slug })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(comparisons.id, parsed.data.comparisonId), eq(projects.teamId, team.id)))
    .limit(1);
  if (!row) return { success: false, error: "Comparison not found." };

  await db
    .update(comparisons)
    .set({ liveViaProxy: parsed.data.viaProxy })
    .where(eq(comparisons.id, row.id));

  revalidatePath(`/projects/${row.projectSlug}/${row.pageId}/compare/${row.id}`);
  return { success: true, data: { id: row.id } };
}
