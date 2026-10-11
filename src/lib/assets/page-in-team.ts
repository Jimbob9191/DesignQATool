import "server-only";

import { and, eq } from "drizzle-orm";

import type { ActionResult } from "@/lib/actions/result";
import { db } from "@/lib/db";
import { pages, projects } from "@/lib/db/schema";

// Not in an action file, so a client can't call it directly.
export async function assertPageInTeam(pageId: string, teamId: string): Promise<ActionResult<true>> {
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
