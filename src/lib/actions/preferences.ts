"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const preferencesSchema = z.object({
  notifyOnMention: z.boolean(),
  notifyOnReply: z.boolean(),
});

export async function getNotificationPreferences(): Promise<{ notifyOnMention: boolean; notifyOnReply: boolean }> {
  const user = await requireUser();
  const [row] = await db
    .select({ notifyOnMention: userPreferences.notifyOnMention, notifyOnReply: userPreferences.notifyOnReply })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1);
  return row ?? { notifyOnMention: true, notifyOnReply: true };
}

export async function updateNotificationPreferences(input: unknown): Promise<ActionResult<true>> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  const user = await requireUser();

  await db
    .insert(userPreferences)
    .values({ userId: user.id, ...parsed.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: parsed.data });

  revalidatePath("/settings");
  return { success: true, data: true };
}
