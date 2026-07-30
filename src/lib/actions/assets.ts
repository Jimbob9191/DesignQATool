"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, pages, projects } from "@/lib/db/schema";
import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";
import { confirmUploadSchema, requestUploadUrlSchema } from "@/lib/validations/asset";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

async function assertPageInTeam(pageId: string, teamId: string): Promise<ActionResult<true>> {
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(pages.id, pageId), eq(projects.teamId, teamId)))
    .limit(1);
  if (!page) {
    return { success: false, error: "Page not found." };
  }
  return { success: true, data: true };
}

export async function requestUploadUrl(
  input: unknown
): Promise<ActionResult<{ assetId: string; storagePath: string; token: string }>> {
  const parsed = requestUploadUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");

  if (parsed.data.pageId) {
    const pageCheck = await assertPageInTeam(parsed.data.pageId, team.id);
    if (!pageCheck.success) return pageCheck;
  }

  const assetId = crypto.randomUUID();
  const storagePath = `${team.id}/${assetId}.${extensionFor(parsed.data.mime)}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { success: false, error: error?.message ?? "Could not create an upload URL." };
  }

  return { success: true, data: { assetId, storagePath, token: data.token } };
}

export async function confirmUpload(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = confirmUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  // storagePath must be `${team.id}/...` — refuse anything else outright,
  // since this is our only server-side guarantee the object belongs to the
  // caller's team (the signed upload token itself doesn't encode that).
  if (!parsed.data.storagePath.startsWith(`${team.id}/`)) {
    return { success: false, error: "Storage path does not belong to your team." };
  }

  if (parsed.data.pageId) {
    const pageCheck = await assertPageInTeam(parsed.data.pageId, team.id);
    if (!pageCheck.success) return pageCheck;
  }

  const [asset] = await db
    .insert(assets)
    .values({
      id: parsed.data.assetId,
      teamId: team.id,
      pageId: parsed.data.pageId,
      kind: "design",
      storagePath: parsed.data.storagePath,
      width: parsed.data.width,
      height: parsed.data.height,
      mime: parsed.data.mime,
      createdBy: user.id,
    })
    .returning({ id: assets.id });

  revalidatePath("/assets");
  return { success: true, data: asset };
}

export async function deleteAsset(assetId: string): Promise<void> {
  const { team } = await requireTeamRole("member");

  const [asset] = await db
    .select({ storagePath: assets.storagePath })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .limit(1);

  if (!asset) return;

  const admin = createAdminClient();
  await admin.storage.from(ASSETS_BUCKET).remove([asset.storagePath]);
  await db.delete(assets).where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)));

  revalidatePath("/assets");
}

export async function setAssetPage(
  assetId: string,
  pageId: string | null
): Promise<ActionResult<{ id: string }>> {
  const { team } = await requireTeamRole("member");

  if (pageId) {
    const pageCheck = await assertPageInTeam(pageId, team.id);
    if (!pageCheck.success) return pageCheck;
  }

  const [asset] = await db
    .update(assets)
    .set({ pageId })
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .returning({ id: assets.id });

  if (!asset) {
    return { success: false, error: "Asset not found." };
  }

  revalidatePath("/assets");
  return { success: true, data: asset };
}
