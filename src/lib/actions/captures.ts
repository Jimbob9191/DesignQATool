"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { callCaptureService, PRESET_VIEWPORTS } from "@/lib/capture/client";
import { db } from "@/lib/db";
import { assets, captures, pages, projects } from "@/lib/db/schema";
import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const startCaptureSchema = z.object({
  pageId: z.uuid(),
  url: z.string().url(),
  viewportWidth: z.union([
    z.literal(PRESET_VIEWPORTS[0]),
    z.literal(PRESET_VIEWPORTS[1]),
    z.literal(PRESET_VIEWPORTS[2]),
  ]),
});

export async function startCapture(
  input: unknown
): Promise<ActionResult<{ captureId: string; assetId: string }>> {
  const parsed = startCaptureSchema.safeParse(input);
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

  const assetId = crypto.randomUUID();
  const storagePath = `${team.id}/${assetId}.webp`;

  await db.insert(assets).values({
    id: assetId,
    teamId: team.id,
    pageId: parsed.data.pageId,
    kind: "capture",
    storagePath,
    mime: "image/webp",
    createdBy: user.id,
  });

  const [capture] = await db
    .insert(captures)
    .values({
      assetId,
      url: parsed.data.url,
      viewportWidth: parsed.data.viewportWidth,
      status: "pending",
    })
    .returning({ id: captures.id });

  const capturePath = `/projects/${page.projectSlug}/${parsed.data.pageId}`;

  after(async () => {
    try {
      const result = await callCaptureService({
        url: parsed.data.url,
        viewportWidth: parsed.data.viewportWidth,
      });

      const admin = createAdminClient();
      const { error: uploadError } = await admin.storage
        .from(ASSETS_BUCKET)
        .upload(storagePath, Buffer.from(result.image, "base64"), {
          contentType: result.mime,
          upsert: true,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      await db.update(assets).set({ width: result.width, height: result.height }).where(eq(assets.id, assetId));
      await db
        .update(captures)
        .set({ status: "ready", elementMap: result.elementMap, capturedAt: new Date() })
        .where(eq(captures.id, capture.id));
    } catch (error) {
      await db
        .update(captures)
        .set({
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Capture failed",
        })
        .where(eq(captures.id, capture.id));
    } finally {
      revalidatePath(capturePath);
    }
  });

  revalidatePath(capturePath);
  return { success: true, data: { captureId: capture.id, assetId } };
}
