"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { resolveAssetScope, type ResolvedAssetScope } from "@/lib/assets/scope";
import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { findPageInTeam, findProjectInTeam } from "@/lib/db/scope";
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

// Turns whatever page/project the client asked for into the pair we are
// willing to store, having proved both belong to `teamId`. A missing page
// reads as "not in this team" to resolveAssetScope, so an out-of-team page id
// and a nonexistent one give the same answer — we never confirm that a page
// exists somewhere else.
async function resolveScopeInTeam(
  input: { pageId: string | null; projectId: string | null },
  teamId: string
): Promise<ActionResult<ResolvedAssetScope>> {
  const page = input.pageId ? await findPageInTeam(input.pageId, teamId) : null;

  const resolved = resolveAssetScope({
    pageId: input.pageId,
    projectId: input.projectId,
    pageProjectId: page?.projectId ?? null,
  });
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }

  // A project standing on its own still needs a team check; in the page
  // branch findPageInTeam already established ownership of both.
  if (resolved.scope.pageId === null && resolved.scope.projectId !== null) {
    const project = await findProjectInTeam(resolved.scope.projectId, teamId);
    if (!project) {
      return { success: false, error: "Project not found." };
    }
  }

  return { success: true, data: resolved.scope };
}

export async function requestUploadUrl(
  input: unknown
): Promise<ActionResult<{ assetId: string; storagePath: string; token: string }>> {
  const parsed = requestUploadUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");

  // Nothing is written here, but rejecting a bad scope now saves the user an
  // upload that confirmUpload would only refuse afterwards.
  const scope = await resolveScopeInTeam(parsed.data, team.id);
  if (!scope.success) return scope;

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

  const scope = await resolveScopeInTeam(parsed.data, team.id);
  if (!scope.success) return scope;

  const [asset] = await db
    .insert(assets)
    .values({
      id: parsed.data.assetId,
      teamId: team.id,
      pageId: scope.data.pageId,
      projectId: scope.data.projectId,
      kind: "design",
      storagePath: parsed.data.storagePath,
      width: parsed.data.width,
      height: parsed.data.height,
      mime: parsed.data.mime,
      createdBy: user.id,
    })
    .returning({ id: assets.id });

  revalidatePath("/assets");
  revalidatePath("/projects");
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

// The single place that writes assets.page_id / assets.project_id after
// creation. setAssetPage and setAssetProject below are conveniences over it
// rather than separate update statements, so there is exactly one code path
// that can put the two columns out of step.
export async function setAssetScope(
  assetId: string,
  scope: { pageId: string | null; projectId: string | null }
): Promise<ActionResult<{ id: string }>> {
  const { team } = await requireTeamRole("member");

  const resolved = await resolveScopeInTeam(scope, team.id);
  if (!resolved.success) return resolved;

  const [asset] = await db
    .update(assets)
    .set({ pageId: resolved.data.pageId, projectId: resolved.data.projectId })
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .returning({ id: assets.id });

  if (!asset) {
    return { success: false, error: "Asset not found." };
  }

  revalidatePath("/assets");
  revalidatePath("/projects");
  return { success: true, data: asset };
}

// Filing an asset against a page implies its project, so the caller never
// supplies one. Passing null clears both columns and returns the asset to the
// team library.
/**
 * Narrowing an asset to a page, or widening it back to the project it already
 * sits in. Clearing the page deliberately keeps project_id: the two selects in
 * the asset card read as nested scopes, so "no page" means "still this
 * project's library, just not filed against a view yet" — the state a
 * comparison can now draw a design from. Dropping out of the project entirely
 * is what clearing the project select is for.
 */
export async function setAssetPage(
  assetId: string,
  pageId: string | null
): Promise<ActionResult<{ id: string }>> {
  if (pageId !== null) {
    // resolveAssetScope derives the project from the page, so passing null here
    // is not a claim that the asset has no project.
    return setAssetScope(assetId, { pageId, projectId: null });
  }

  const { team } = await requireTeamRole("member");
  const [current] = await db
    .select({ projectId: assets.projectId })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .limit(1);

  if (!current) {
    return { success: false, error: "Asset not found." };
  }

  return setAssetScope(assetId, { pageId: null, projectId: current.projectId });
}

// Moving an asset to a project (or back to the library with null) drops any
// page assignment — the old page almost certainly lives in a different
// project, and keeping it would contradict the new project.
export async function setAssetProject(
  assetId: string,
  projectId: string | null
): Promise<ActionResult<{ id: string }>> {
  return setAssetScope(assetId, { pageId: null, projectId });
}
