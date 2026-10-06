"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { getCurrentUser } from "@/lib/auth/team";
import type { ElementMapEntry } from "@/lib/annotations/hit-test";
import { resolveAnnotationForNewCapture } from "@/lib/annotations/resolve";
import { db } from "@/lib/db";
import {
  annotationStatusEnum,
  annotations,
  assets,
  captures,
  comparisons,
  pages,
  projects,
} from "@/lib/db/schema";

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const createAnnotationSchema = z.object({
  comparisonId: z.uuid(),
  target: z.enum(["design", "live"]),
  // null for a pin on a live comparison's site, which has no image
  assetId: z.uuid().nullable(),
  xRatio: z.number().min(0).max(1),
  yPx: z.number().min(0),
  elementSelector: z.string().max(2000).nullable().optional(),
  elementRect: rectSchema.nullable().optional(),
  elementText: z.string().max(200).nullable().optional(),
  pageUrl: z.url({ protocol: /^https?$/ }).max(2000).nullable().optional(),
});

async function assertComparisonInTeam(comparisonId: string, teamId: string) {
  const [row] = await db
    .select({
      id: comparisons.id,
      pageId: comparisons.pageId,
      projectSlug: projects.slug,
      designAssetId: comparisons.designAssetId,
      captureAssetId: comparisons.captureAssetId,
    })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(comparisons.id, comparisonId), eq(projects.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

export async function createAnnotation(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createAnnotationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await authorizeTeamRole("viewer");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const comparison = await assertComparisonInTeam(parsed.data.comparisonId, team.id);
  if (!comparison) {
    return { success: false, error: "Comparison not found." };
  }

  // A pin sits on one of this comparison's images, never an arbitrary asset
  // id from the client — or, on a live comparison, on the site itself.
  const expectedAssetId =
    parsed.data.target === "design" ? comparison.designAssetId : comparison.captureAssetId;
  if (parsed.data.assetId !== expectedAssetId) {
    return { success: false, error: "That image isn't part of this comparison." };
  }
  const isSitePin = parsed.data.target === "live" && !comparison.captureAssetId;
  if (isSitePin && !parsed.data.pageUrl) {
    return { success: false, error: "Missing the page this pin is on." };
  }

  const [annotation] = await db
    .insert(annotations)
    .values({
      comparisonId: parsed.data.comparisonId,
      target: parsed.data.target,
      assetId: parsed.data.assetId,
      xRatio: String(parsed.data.xRatio),
      yPx: Math.round(parsed.data.yPx),
      elementSelector: parsed.data.elementSelector ?? null,
      elementRect: parsed.data.elementRect ?? null,
      elementText: isSitePin ? (parsed.data.elementText ?? null) : null,
      pageUrl: isSitePin ? (parsed.data.pageUrl ?? null) : null,
      createdBy: user.id,
    })
    .returning({ id: annotations.id });

  revalidatePath(`/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${parsed.data.comparisonId}`);
  return { success: true, data: annotation };
}

const updatePositionSchema = z.object({
  xRatio: z.number().min(0).max(1),
  yPx: z.number().min(0),
});

export async function updateAnnotationPosition(
  annotationId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = updatePositionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isUuid(annotationId)) return { success: false, error: "Annotation not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [existing] = await db
    .select({ comparisonId: annotations.comparisonId })
    .from(annotations)
    .where(eq(annotations.id, annotationId))
    .limit(1);
  if (!existing) return { success: false, error: "Annotation not found." };

  const comparison = await assertComparisonInTeam(existing.comparisonId, team.id);
  if (!comparison) return { success: false, error: "Annotation not found." };

  // Dragging to a new position is a deliberate re-placement — it's no
  // longer where the (possibly stale) element anchor pointed, so drop the
  // element anchor and treat it as a fresh coordinate pin instead of
  // silently leaving a mismatched selector/rect behind.
  const [updated] = await db
    .update(annotations)
    .set({
      xRatio: String(parsed.data.xRatio),
      yPx: Math.round(parsed.data.yPx),
      elementSelector: null,
      elementRect: null,
      status: "open",
    })
    .where(eq(annotations.id, annotationId))
    .returning({ id: annotations.id });

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${existing.comparisonId}`
  );
  return { success: true, data: updated };
}

const statusSchema = z.enum(annotationStatusEnum.enumValues);

export async function updateAnnotationStatus(
  annotationId: string,
  status: (typeof annotationStatusEnum.enumValues)[number]
): Promise<ActionResult<{ id: string }>> {
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) return { success: false, error: "Invalid status." };
  if (!isUuid(annotationId)) return { success: false, error: "Annotation not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [existing] = await db
    .select({ comparisonId: annotations.comparisonId })
    .from(annotations)
    .where(eq(annotations.id, annotationId))
    .limit(1);
  if (!existing) return { success: false, error: "Annotation not found." };

  const comparison = await assertComparisonInTeam(existing.comparisonId, team.id);
  if (!comparison) return { success: false, error: "Annotation not found." };

  const [updated] = await db
    .update(annotations)
    .set({ status: parsedStatus.data })
    .where(eq(annotations.id, annotationId))
    .returning({ id: annotations.id });

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${existing.comparisonId}`
  );
  return { success: true, data: updated };
}

export async function deleteAnnotation(annotationId: string): Promise<ActionResult<{ id: string }>> {
  if (!isUuid(annotationId)) return { success: false, error: "Annotation not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const [existing] = await db
    .select({ comparisonId: annotations.comparisonId })
    .from(annotations)
    .where(eq(annotations.id, annotationId))
    .limit(1);
  if (!existing) return { success: false, error: "Annotation not found." };

  const comparison = await assertComparisonInTeam(existing.comparisonId, team.id);
  if (!comparison) return { success: false, error: "Annotation not found." };

  await db.delete(annotations).where(eq(annotations.id, annotationId));

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${existing.comparisonId}`
  );
  return { success: true, data: { id: annotationId } };
}

/**
 * Points a comparison at a newer capture of the same page and re-resolves
 * every "live" annotation's selector against that capture's element map —
 * repositioning pins that still match, and flagging the rest needs_review
 * rather than losing them.
 */
export async function refreshComparisonCapture(
  comparisonId: string,
  newCaptureAssetId: string
): Promise<ActionResult<{ reresolved: number; needsReview: number }>> {
  if (!isUuid(comparisonId)) return { success: false, error: "Comparison not found." };
  if (!isUuid(newCaptureAssetId)) return { success: false, error: "Capture not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;

  const comparison = await assertComparisonInTeam(comparisonId, team.id);
  if (!comparison) return { success: false, error: "Comparison not found." };
  if (!comparison.captureAssetId) {
    return { success: false, error: "This comparison shows the live site, not a capture." };
  }

  const [captureRow] = await db
    .select({ elementMap: captures.elementMap, width: assets.width })
    .from(captures)
    .innerJoin(assets, eq(captures.assetId, assets.id))
    .where(and(eq(captures.assetId, newCaptureAssetId), eq(assets.teamId, team.id)))
    .limit(1);
  if (!captureRow || !captureRow.width) {
    return { success: false, error: "Capture not found." };
  }

  const newElementMap = (captureRow.elementMap as ElementMapEntry[] | null) ?? [];

  const liveAnnotations = await db
    .select()
    .from(annotations)
    .where(and(eq(annotations.comparisonId, comparisonId), eq(annotations.target, "live")));

  let reresolved = 0;
  let needsReview = 0;

  for (const annotation of liveAnnotations) {
    const result = resolveAnnotationForNewCapture(
      {
        xRatio: Number(annotation.xRatio),
        yPx: annotation.yPx,
        elementSelector: annotation.elementSelector,
        elementRect: annotation.elementRect as { x: number; y: number; width: number; height: number } | null,
        imageWidth: captureRow.width,
      },
      newElementMap
    );

    if (result.needsReview) needsReview++;
    else reresolved++;

    await db
      .update(annotations)
      .set({
        xRatio: String(result.xRatio),
        yPx: Math.round(result.yPx),
        elementRect: result.elementRect,
        status: result.needsReview ? "needs_review" : annotation.status,
        assetId: newCaptureAssetId,
      })
      .where(eq(annotations.id, annotation.id));
  }

  await db
    .update(comparisons)
    .set({ captureAssetId: newCaptureAssetId })
    .where(eq(comparisons.id, comparisonId));

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${comparisonId}`
  );
  return { success: true, data: { reresolved, needsReview } };
}
