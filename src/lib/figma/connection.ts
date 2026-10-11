import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { figmaConnections } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { FigmaToken } from "@/lib/figma/api";
import { decryptToken, encryptToken } from "@/lib/figma/crypto";

/** Figma import is only offered when there's a key to encrypt tokens with. */
export function isFigmaEnabled(): boolean {
  return Boolean(env.FIGMA_TOKEN_KEY);
}

export function encryptFigmaToken(token: string): string {
  if (!env.FIGMA_TOKEN_KEY) throw new Error("FIGMA_TOKEN_KEY is not set.");
  return encryptToken(token, env.FIGMA_TOKEN_KEY);
}

export type FigmaConnection = { handle: string; email: string | null; token: FigmaToken };

/**
 * The user's Figma connection with its token decrypted, or null if they
 * haven't connected (or the key has been rotated since, which reads the same
 * as not connected: they reconnect). The one place an OAuth token will be
 * refreshed once there is a public OAuth app.
 */
export async function getFigmaConnection(userId: string): Promise<FigmaConnection | null> {
  if (!env.FIGMA_TOKEN_KEY) return null;

  const [row] = await db
    .select({
      authType: figmaConnections.authType,
      accessTokenEnc: figmaConnections.accessTokenEnc,
      handle: figmaConnections.figmaHandle,
      email: figmaConnections.figmaEmail,
    })
    .from(figmaConnections)
    .where(eq(figmaConnections.userId, userId))
    .limit(1);
  if (!row) return null;

  const value = decryptToken(row.accessTokenEnc, env.FIGMA_TOKEN_KEY);
  if (!value) return null;

  return { handle: row.handle, email: row.email, token: { type: row.authType, value } };
}

export type FigmaImportState = "disabled" | "disconnected" | "connected";

/** Whether to offer Figma import to this user, and whether they can use it yet. */
export async function getFigmaImportState(userId: string): Promise<FigmaImportState> {
  if (!isFigmaEnabled()) return "disabled";
  const [row] = await db
    .select({ userId: figmaConnections.userId })
    .from(figmaConnections)
    .where(eq(figmaConnections.userId, userId))
    .limit(1);
  return row ? "connected" : "disconnected";
}
