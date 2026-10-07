"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { getCurrentUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { annotations, assets, comparisons, pages, projects } from "@/lib/db/schema";
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

const updateComparisonSchema = createComparisonSchema
  .omit({ pageId: true, liveUrl: true, viewportWidth: true })
  .extend({
    // Absent for the older screenshot comparisons, which have neither.
    liveUrl: createComparisonSchema.shape.liveUrl.optional(),
    viewportWidth: createComparisonSchema.shape.viewportWidth.optional(),
  });

export async function updateComparison(
  comparisonId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(comparisonId)) return { success: false, error: "Comparison not found." };
  const parsed = updateComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [row] = await db
    .select({
      id: comparisons.id,
      pageId: comparisons.pageId,
      projectSlug: projects.slug,
      captureAssetId: comparisons.captureAssetId,
      designAssetId: comparisons.designAssetId,
      designWidth: assets.width,
    })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .innerJoin(assets, eq(comparisons.designAssetId, assets.id))
    .where(and(eq(comparisons.id, comparisonId), eq(projects.teamId, team.id)))
    .limit(1);
  if (!row) return { success: false, error: "Comparison not found." };

  const isLive = !row.captureAssetId;
  const { liveUrl, viewportWidth } = parsed.data;
  if (isLive && (liveUrl === undefined || viewportWidth === undefined)) {
    return { success: false, error: "Enter the live URL and viewport width." };
  }

  // Same rule as create: any of the team's designs, and one that isn't on a
  // page yet joins this comparison's page.
  const [designAsset] = await db
    .select({ id: assets.id, pageId: assets.pageId, width: assets.width })
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

  await db.transaction(async (tx) => {
    if (!designAsset.pageId) {
      await tx.update(assets).set({ pageId: row.pageId }).where(eq(assets.id, designAsset.id));
    }

    await tx
      .update(comparisons)
      .set({
        name: parsed.data.name,
        designAssetId: designAsset.id,
        // Screenshot comparisons keep their null URL and width.
        ...(isLive ? { liveUrl, viewportWidth } : {}),
      })
      .where(eq(comparisons.id, row.id));

    if (designAsset.id !== row.designAssetId) {
      // Design-pane pins point at the design asset, and cascade-delete with
      // it, so they move to the new one. They're stored as a fraction of the
      // design's width and a y in its pixels: scaling y by the change in
      // width keeps them in place when the new design is the same layout at
      // another size (a @2x export, say). For a different layout they'll
      // need moving by hand either way, which the edit dialog warns about.
      const scale = row.designWidth && designAsset.width ? designAsset.width / row.designWidth : 1;
      await tx
        .update(annotations)
        .set({
          assetId: designAsset.id,
          ...(scale !== 1 ? { yPx: sql`round(${annotations.yPx} * ${scale}::numeric)::integer` } : {}),
        })
        .where(and(eq(annotations.comparisonId, row.id), eq(annotations.target, "design")));
    }
  });

  revalidatePath(`/projects/${row.projectSlug}/${row.pageId}`);
  revalidatePath(`/projects/${row.projectSlug}/${row.pageId}/compare/${row.id}`);
  return { success: true, data: { id: row.id } };
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
