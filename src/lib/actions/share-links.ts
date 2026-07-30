"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { annotations, comments, comparisons, pages, projects, shareLinks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { notifyCommentParticipants } from "@/lib/notifications/notify";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function resolveOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host");
  if (!host) return env.NEXT_PUBLIC_SITE_URL;
  const protocol =
    headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function assertComparisonInTeam(comparisonId: string, teamId: string) {
  const [row] = await db
    .select({ id: comparisons.id, pageId: comparisons.pageId, projectSlug: projects.slug })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(comparisons.id, comparisonId), eq(projects.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

const createShareLinkSchema = z.object({
  comparisonId: z.uuid(),
  allowAnonymousComments: z.boolean(),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
});

export async function createShareLink(
  input: unknown
): Promise<ActionResult<{ url: string }>> {
  const parsed = createShareLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const comparison = await assertComparisonInTeam(parsed.data.comparisonId, team.id);
  if (!comparison) return { success: false, error: "Comparison not found." };

  const token = randomBytes(18).toString("hex");
  await db.insert(shareLinks).values({
    comparisonId: parsed.data.comparisonId,
    token,
    allowAnonymousComments: parsed.data.allowAnonymousComments,
    expiresAt: parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null,
    createdBy: user.id,
  });

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${parsed.data.comparisonId}`
  );
  const origin = await resolveOrigin();
  return { success: true, data: { url: `${origin}/share/${token}` } };
}

export async function revokeShareLink(shareLinkId: string, comparisonId: string): Promise<void> {
  const { team } = await requireTeamRole("member");

  const comparison = await assertComparisonInTeam(comparisonId, team.id);
  if (!comparison) return;

  await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, shareLinkId), eq(shareLinks.comparisonId, comparisonId)));

  revalidatePath(
    `/projects/${comparison.projectSlug}/${comparison.pageId}/compare/${comparisonId}`
  );
}

const addAnonymousCommentSchema = z.object({
  annotationId: z.uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(4000),
  guestName: z.string().trim().min(1, "Name is required").max(80),
});

export async function addAnonymousComment(
  token: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = addAnonymousCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [shareLink] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) {
    return { success: false, error: "This share link is invalid or has expired." };
  }
  if (!shareLink.allowAnonymousComments) {
    return { success: false, error: "Comments aren't enabled on this share link." };
  }

  const [annotation] = await db
    .select({ id: annotations.id })
    .from(annotations)
    .where(
      and(eq(annotations.id, parsed.data.annotationId), eq(annotations.comparisonId, shareLink.comparisonId))
    )
    .limit(1);
  if (!annotation) {
    return { success: false, error: "Pin not found." };
  }

  const [comment] = await db
    .insert(comments)
    .values({
      annotationId: parsed.data.annotationId,
      body: parsed.data.body,
      guestName: parsed.data.guestName,
    })
    .returning({ id: comments.id });

  after(() =>
    notifyCommentParticipants({
      annotationId: parsed.data.annotationId,
      commentBody: parsed.data.body,
      authorUserId: null,
      authorLabel: parsed.data.guestName,
    })
  );

  return { success: true, data: comment };
}
