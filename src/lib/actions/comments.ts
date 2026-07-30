"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { annotations, comments, comparisons, pages, projects } from "@/lib/db/schema";
import { notifyCommentParticipants } from "@/lib/notifications/notify";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function assertAnnotationInTeam(annotationId: string, teamId: string) {
  const [row] = await db
    .select({
      annotationId: annotations.id,
      comparisonId: annotations.comparisonId,
      pageId: comparisons.pageId,
      projectSlug: projects.slug,
    })
    .from(annotations)
    .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(annotations.id, annotationId), eq(projects.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

const createCommentSchema = z.object({
  annotationId: z.uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(4000),
});

export async function createComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("viewer");
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const annotation = await assertAnnotationInTeam(parsed.data.annotationId, team.id);
  if (!annotation) return { success: false, error: "Annotation not found." };

  const [comment] = await db
    .insert(comments)
    .values({
      annotationId: parsed.data.annotationId,
      body: parsed.data.body,
      createdBy: user.id,
    })
    .returning({ id: comments.id });

  revalidatePath(
    `/projects/${annotation.projectSlug}/${annotation.pageId}/compare/${annotation.comparisonId}`
  );

  after(() =>
    notifyCommentParticipants({
      annotationId: parsed.data.annotationId,
      commentBody: parsed.data.body,
      authorUserId: user.id,
      authorLabel: user.email ?? "Someone",
    })
  );

  return { success: true, data: comment };
}

const updateCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(4000),
});

export async function updateComment(
  commentId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const [existing] = await db
    .select({ createdBy: comments.createdBy, annotationId: comments.annotationId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing) return { success: false, error: "Comment not found." };
  if (existing.createdBy !== user.id) {
    return { success: false, error: "You can only edit your own comments." };
  }

  const { team } = await requireTeamRole("viewer");
  const annotation = await assertAnnotationInTeam(existing.annotationId, team.id);
  if (!annotation) return { success: false, error: "Comment not found." };

  const [updated] = await db
    .update(comments)
    .set({ body: parsed.data.body, editedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning({ id: comments.id });

  revalidatePath(
    `/projects/${annotation.projectSlug}/${annotation.pageId}/compare/${annotation.comparisonId}`
  );
  return { success: true, data: updated };
}

export async function deleteComment(commentId: string): Promise<ActionResult<true>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not signed in." };

  const [existing] = await db
    .select({ createdBy: comments.createdBy, annotationId: comments.annotationId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing) return { success: true, data: true };
  if (existing.createdBy !== user.id) {
    return { success: false, error: "You can only delete your own comments." };
  }

  const { team } = await requireTeamRole("viewer");
  const annotation = await assertAnnotationInTeam(existing.annotationId, team.id);
  if (!annotation) return { success: false, error: "Comment not found." };

  await db.delete(comments).where(eq(comments.id, commentId));

  revalidatePath(
    `/projects/${annotation.projectSlug}/${annotation.pageId}/compare/${annotation.comparisonId}`
  );
  return { success: true, data: true };
}
