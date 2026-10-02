import "server-only";

import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import { db } from "@/lib/db";
import {
  annotations,
  comments,
  comparisons,
  pages,
  projects,
  teamMembers,
  userPreferences,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/resend";
import { commentNotificationEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

const MENTION_PATTERN = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function extractMentionedEmails(body: string): Set<string> {
  const emails = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    emails.add(match[1].toLowerCase());
  }
  return emails;
}

async function getPreferences(userId: string): Promise<{ notifyOnMention: boolean; notifyOnReply: boolean }> {
  const [row] = await db
    .select({ notifyOnMention: userPreferences.notifyOnMention, notifyOnReply: userPreferences.notifyOnReply })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  // No row yet means defaults (both enabled) — see the lazy-creation note on
  // the schema; we don't need to write a row just to read the default.
  return row ?? { notifyOnMention: true, notifyOnReply: true };
}

/**
 * Fires after a comment (authenticated or anonymous) is created. Notifies:
 * - team members @mentioned by email in the comment body (if they opted in)
 * - everyone else who has previously commented on the same pin, i.e. a
 *   "reply" (if they opted in) — excluding the author and anyone already
 *   notified as a mention, so nobody gets two emails for one comment.
 * Best-effort: failures are swallowed so a broken notification never blocks
 * the comment itself from saving.
 */
export async function notifyCommentParticipants(input: {
  annotationId: string;
  commentBody: string;
  authorUserId: string | null;
  authorLabel: string;
}): Promise<void> {
  try {
    const [context] = await db
      .select({
        comparisonId: annotations.comparisonId,
        pageId: comparisons.pageId,
        projectSlug: projects.slug,
        projectTeamId: projects.teamId,
      })
      .from(annotations)
      .innerJoin(comparisons, eq(annotations.comparisonId, comparisons.id))
      .innerJoin(pages, eq(comparisons.pageId, pages.id))
      .innerJoin(projects, eq(pages.projectId, projects.id))
      .where(eq(annotations.id, input.annotationId))
      .limit(1);
    if (!context) return;

    const mentionedEmails = extractMentionedEmails(input.commentBody);

    const teamMemberRows = await db
      .select({ userId: teamMembers.userId, email: authUsers.email })
      .from(teamMembers)
      .innerJoin(authUsers, eq(teamMembers.userId, authUsers.id))
      .where(eq(teamMembers.teamId, context.projectTeamId));

    const mentionedUserIds = new Set(
      teamMemberRows
        .filter((m) => m.email && mentionedEmails.has(m.email.toLowerCase()))
        .map((m) => m.userId)
    );

    const priorCommentRows = await db
      .select({ createdBy: comments.createdBy, authorEmail: authUsers.email })
      .from(comments)
      .leftJoin(authUsers, eq(comments.createdBy, authUsers.id))
      .where(eq(comments.annotationId, input.annotationId));

    const replyUserIds = new Set(
      priorCommentRows
        .map((r) => r.createdBy)
        .filter((id): id is string => id !== null && id !== input.authorUserId && !mentionedUserIds.has(id))
    );

    const url = `${env.NEXT_PUBLIC_SITE_URL}/projects/${context.projectSlug}/${context.pageId}/compare/${context.comparisonId}`;

    const recipients: { userId: string; email: string; reason: "mention" | "reply" }[] = [];
    for (const m of teamMemberRows) {
      if (!m.email || m.userId === input.authorUserId) continue;
      if (mentionedUserIds.has(m.userId)) {
        recipients.push({ userId: m.userId, email: m.email, reason: "mention" });
      } else if (replyUserIds.has(m.userId)) {
        recipients.push({ userId: m.userId, email: m.email, reason: "reply" });
      }
    }

    await Promise.all(
      recipients.map(async (recipient) => {
        const prefs = await getPreferences(recipient.userId);
        if (recipient.reason === "mention" && !prefs.notifyOnMention) return;
        if (recipient.reason === "reply" && !prefs.notifyOnReply) return;

        await sendEmail({
          to: recipient.email,
          ...commentNotificationEmail({
            authorLabel: input.authorLabel,
            reason: recipient.reason,
            commentBody: input.commentBody,
            url,
          }),
        });
      })
    );
  } catch {
    // Notifications are best-effort — never let a delivery failure surface
    // as a broken comment submission.
  }
}
