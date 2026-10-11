"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { and, eq } from "drizzle-orm";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { assertPageInTeam } from "@/lib/assets/page-in-team";
import { getCurrentUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, figmaConnections } from "@/lib/db/schema";
import {
  FigmaError,
  getFileMeta,
  getFrame,
  getMe,
  renderPng,
  type FigmaToken,
} from "@/lib/figma/api";
import { encryptFigmaToken, getFigmaConnection, isFigmaEnabled } from "@/lib/figma/connection";
import { pickRenderScale, pngSize } from "@/lib/figma/image";
import { parseFigmaLink, type FigmaFrameRef } from "@/lib/figma/links";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";
import { MAX_ASSET_SIZE_BYTES } from "@/lib/validations/asset";
import { connectFigmaSchema, importFigmaFrameSchema } from "@/lib/validations/figma";

const NOT_ENABLED = "Figma import isn't set up on this server.";
const NOT_CONNECTED = "Connect your Figma account in Settings first.";

function figmaFailure(error: unknown, context: string): { success: false; error: string } {
  if (error instanceof FigmaError) return { success: false, error: error.message };
  console.error(`[figma] ${context}:`, error);
  return { success: false, error: "Something went wrong talking to Figma. Try again in a moment." };
}

export async function connectFigmaPat(input: unknown): Promise<ActionResult<{ handle: string }>> {
  if (!isFigmaEnabled()) return { success: false, error: NOT_ENABLED };
  const parsed = connectFigmaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  if (!(await consumeRateLimit(`figma-connect:user:${user.id}`, 10, 10 * 60))) {
    return { success: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const token: FigmaToken = { type: "pat", value: parsed.data.token };
  let me;
  try {
    me = await getMe(token);
  } catch (error) {
    if (error instanceof FigmaError && (error.status === 401 || error.status === 403)) {
      return { success: false, error: "Figma didn't accept that token. Check you copied all of it." };
    }
    return figmaFailure(error, "connect");
  }

  const values = {
    authType: "pat" as const,
    accessTokenEnc: encryptFigmaToken(token.value),
    refreshTokenEnc: null,
    expiresAt: null,
    figmaUserId: me.id,
    figmaHandle: me.handle,
    figmaEmail: me.email,
    updatedAt: new Date(),
  };
  await db
    .insert(figmaConnections)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: figmaConnections.userId, set: values });

  revalidatePath("/settings");
  return { success: true, data: { handle: me.handle } };
}

export async function disconnectFigma(): Promise<ActionResult<true>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  await db.delete(figmaConnections).where(eq(figmaConnections.userId, user.id));

  revalidatePath("/settings");
  return { success: true, data: true };
}

type Render = { bytes: Uint8Array; width: number; height: number; version: string; frameName: string; fileName: string };

/**
 * Renders the frame at the file's current version: /meta (Tier 3) for the
 * version, then nodes and images (Tier 1 each). Pinning both Tier 1 calls to
 * one version means the size we check is the size that gets rendered.
 */
async function renderFrame(token: FigmaToken, ref: FigmaFrameRef): Promise<Render> {
  const meta = await getFileMeta(token, ref.fileKey);
  const frame = await getFrame(token, ref.fileKey, ref.nodeId, meta.version);

  const scale = pickRenderScale(frame);
  if (!scale) {
    throw new FigmaError(
      "That frame is too big for Figma to render at full size. Split it into smaller frames.",
      400
    );
  }

  const bytes = await renderPng(token, ref.fileKey, ref.nodeId, { scale, version: meta.version });
  const size = pngSize(bytes);
  if (!size) {
    throw new FigmaError("Figma sent back something that isn't a PNG. Try again in a moment.", 500);
  }
  if (bytes.byteLength > MAX_ASSET_SIZE_BYTES) {
    throw new FigmaError(
      "That frame's render is over the 25MB limit. Split it into smaller frames, or simplify heavy images in it.",
      400
    );
  }

  return { bytes, ...size, version: meta.version, frameName: frame.name, fileName: meta.name };
}

function displayName(render: Render): string {
  const name = render.frameName.trim() || render.fileName.trim() || "Figma frame";
  return name.slice(0, 255);
}

export async function importFigmaFrame(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!isFigmaEnabled()) return { success: false, error: NOT_ENABLED };
  const parsed = importFigmaFrameSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const link = parseFigmaLink(parsed.data.url);
  if (!link.success) return link;

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  if (parsed.data.pageId) {
    const pageCheck = await assertPageInTeam(parsed.data.pageId, team.id);
    if (!pageCheck.success) return pageCheck;
  }

  const connection = await getFigmaConnection(user.id);
  if (!connection) return { success: false, error: NOT_CONNECTED };

  // Figma limits each user itself; this only stops one account from tying up
  // the server downloading renders.
  if (!(await consumeRateLimit(`figma-render:user:${user.id}`, 30, 10 * 60))) {
    return { success: false, error: "Too many imports at once. Try again in a few minutes." };
  }

  let render: Render;
  try {
    render = await renderFrame(connection.token, link.data);
  } catch (error) {
    return figmaFailure(error, "import");
  }

  const assetId = crypto.randomUUID();
  const storagePath = `${team.id}/${assetId}.png`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(ASSETS_BUCKET)
    .upload(storagePath, render.bytes, { contentType: "image/png" });
  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const [asset] = await db
    .insert(assets)
    .values({
      id: assetId,
      teamId: team.id,
      pageId: parsed.data.pageId,
      kind: "design",
      storagePath,
      name: displayName(render),
      width: render.width,
      height: render.height,
      mime: "image/png",
      figmaFileKey: link.data.fileKey,
      figmaNodeId: link.data.nodeId,
      figmaVersion: render.version,
      figmaSyncedAt: new Date(),
      createdBy: user.id,
    })
    .returning({ id: assets.id });

  revalidatePath("/assets");
  return { success: true, data: asset };
}

export async function resyncFigmaAsset(
  assetId: string
): Promise<ActionResult<{ dimensionsChanged: boolean }>> {
  if (!isFigmaEnabled()) return { success: false, error: NOT_ENABLED };
  if (!isUuid(assetId)) return { success: false, error: "Asset not found." };

  const auth = await authorizeTeamRole("member");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const [asset] = await db
    .select({
      storagePath: assets.storagePath,
      width: assets.width,
      height: assets.height,
      figmaFileKey: assets.figmaFileKey,
      figmaNodeId: assets.figmaNodeId,
    })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .limit(1);
  if (!asset) return { success: false, error: "Asset not found." };
  if (!asset.figmaFileKey || !asset.figmaNodeId) {
    return { success: false, error: "That design wasn't imported from Figma." };
  }

  const connection = await getFigmaConnection(user.id);
  if (!connection) return { success: false, error: NOT_CONNECTED };

  if (!(await consumeRateLimit(`figma-render:user:${user.id}`, 30, 10 * 60))) {
    return { success: false, error: "Too many re-syncs at once. Try again in a few minutes." };
  }

  let render: Render;
  try {
    render = await renderFrame(connection.token, {
      fileKey: asset.figmaFileKey,
      nodeId: asset.figmaNodeId,
    });
  } catch (error) {
    return figmaFailure(error, "re-sync");
  }

  // A new path each time, never an overwrite: signed URLs are cached for up
  // to an hour by path (src/lib/assets/signed-url.ts), so overwriting would
  // keep serving the old image, from the browser's cache if not ours.
  const storagePath = `${team.id}/${assetId}-${crypto.randomUUID().slice(0, 8)}.png`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(ASSETS_BUCKET)
    .upload(storagePath, render.bytes, { contentType: "image/png" });
  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  // Only swap if nobody else re-synced in the meantime; otherwise their
  // render stands and ours is thrown away, rather than both deleting the same
  // old file and one new file being left with no row.
  const [updated] = await db
    .update(assets)
    .set({
      storagePath,
      width: render.width,
      height: render.height,
      mime: "image/png",
      figmaVersion: render.version,
      figmaSyncedAt: new Date(),
    })
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.teamId, team.id),
        eq(assets.storagePath, asset.storagePath)
      )
    )
    .returning({ id: assets.id });

  const stale = updated ? asset.storagePath : storagePath;
  const { error: removeError } = await admin.storage.from(ASSETS_BUCKET).remove([stale]);
  if (removeError) {
    console.error(`[figma] could not remove ${stale} from storage:`, removeError.message);
  }

  revalidatePath("/assets");
  return {
    success: true,
    data: {
      dimensionsChanged: asset.width !== render.width || asset.height !== render.height,
    },
  };
}

// Tier 3, but a comparison page asks every time it's opened, so remember the
// answer for a few minutes per user and file. Throwing keeps failures out of
// the cache.
const fileVersionCached = unstable_cache(
  async (userId: string, fileKey: string) => {
    const connection = await getFigmaConnection(userId);
    if (!connection) throw new Error("not connected");
    const { version } = await getFileMeta(connection.token, fileKey);
    return { version, fetchedAt: Date.now() };
  },
  ["figma-file-version"],
  { revalidate: 5 * 60 }
);

/**
 * Whether the Figma file has changed since the asset was rendered. File
 * versions are per file, not per frame, so "changed" means something in the
 * file did, which may not be this frame. Null when we can't tell (not
 * connected, no access, Figma down), which the UI shows as no news.
 */
export async function checkFigmaAsset(
  assetId: string
): Promise<ActionResult<{ outdated: boolean | null }>> {
  if (!isFigmaEnabled() || !isUuid(assetId)) return { success: true, data: { outdated: null } };

  const auth = await authorizeTeamRole("viewer");
  if (!auth.success) return auth;
  const { team } = auth.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const [asset] = await db
    .select({
      figmaFileKey: assets.figmaFileKey,
      figmaVersion: assets.figmaVersion,
      figmaSyncedAt: assets.figmaSyncedAt,
    })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.teamId, team.id)))
    .limit(1);
  if (!asset?.figmaFileKey || !asset.figmaVersion) return { success: true, data: { outdated: null } };

  try {
    const latest = await fileVersionCached(user.id, asset.figmaFileKey);
    // An answer from before the last re-sync can't know about it; that render
    // was of the latest version at the time, so there's no news yet.
    if (asset.figmaSyncedAt && latest.fetchedAt < asset.figmaSyncedAt.getTime()) {
      return { success: true, data: { outdated: false } };
    }
    return { success: true, data: { outdated: latest.version !== asset.figmaVersion } };
  } catch {
    return { success: true, data: { outdated: null } };
  }
}
