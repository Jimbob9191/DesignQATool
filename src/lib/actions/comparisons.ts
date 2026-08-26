"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getCurrentUser, requireTeamRole } from "@/lib/auth/team";
import { checkComparisonAssets } from "@/lib/comparisons/eligibility";
import { db } from "@/lib/db";
import { assets, comparisons } from "@/lib/db/schema";
import { findPageInTeam } from "@/lib/db/scope";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const createComparisonSchema = z.object({
  pageId: z.uuid(),
  designAssetId: z.uuid(),
  captureAssetId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(100),
});

// Thrown inside the transaction below purely to roll it back; it never
// escapes createComparison.
class ConcurrentAssignmentError extends Error {}

export async function createComparison(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { team } = await requireTeamRole("member");
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  const scope = await findPageInTeam(parsed.data.pageId, team.id);
  if (!scope) {
    return { success: false, error: "Page not found." };
  }

  // Fetch exactly the two rows the caller named rather than everything filed
  // on the page: a design may legitimately still be sitting in the project
  // library, and checkComparisonAssets is what decides.
  const candidates = await db
    .select({ id: assets.id, kind: assets.kind, pageId: assets.pageId, projectId: assets.projectId })
    .from(assets)
    .where(
      and(
        eq(assets.teamId, team.id),
        inArray(assets.id, [parsed.data.designAssetId, parsed.data.captureAssetId])
      )
    );

  const eligibility = checkComparisonAssets({
    pageId: scope.pageId,
    projectId: scope.projectId,
    designAssetId: parsed.data.designAssetId,
    captureAssetId: parsed.data.captureAssetId,
    candidates,
  });
  if (!eligibility.ok) {
    return { success: false, error: eligibility.error };
  }

  const values = {
    pageId: parsed.data.pageId,
    designAssetId: parsed.data.designAssetId,
    captureAssetId: parsed.data.captureAssetId,
    name: parsed.data.name,
    createdBy: user.id,
  };

  let comparison: { id: string } | undefined;

  if (eligibility.designNeedsPageAssignment) {
    try {
      comparison = await db.transaction(async (tx) => {
        // Re-assert page_id IS NULL inside the transaction: between the read
        // above and now, someone else may have filed this design onto another
        // page. Matching zero rows means exactly that, and we would rather
        // fail than leave a comparison pointing at an asset that has since
        // moved elsewhere.
        const [filed] = await tx
          .update(assets)
          .set({ pageId: scope.pageId, projectId: scope.projectId })
          .where(
            and(
              eq(assets.id, parsed.data.designAssetId),
              eq(assets.teamId, team.id),
              isNull(assets.pageId),
              eq(assets.projectId, scope.projectId)
            )
          )
          .returning({ id: assets.id });

        if (!filed) {
          throw new ConcurrentAssignmentError();
        }

        const [created] = await tx.insert(comparisons).values(values).returning({
          id: comparisons.id,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof ConcurrentAssignmentError) {
        return {
          success: false,
          error: "That design was just assigned to another page. Reload and try again.",
        };
      }
      throw error;
    }
  } else {
    [comparison] = await db.insert(comparisons).values(values).returning({ id: comparisons.id });
  }

  if (!comparison) {
    return { success: false, error: "Could not create the comparison." };
  }

  // The design may have moved out of the library and onto the page, so the
  // asset list and the project overview are stale too, not just this page.
  revalidatePath(`/projects/${scope.projectSlug}/${parsed.data.pageId}`);
  revalidatePath(`/projects/${scope.projectSlug}`);
  revalidatePath("/assets");
  return { success: true, data: comparison };
}

export async function deleteComparison(pageId: string, comparisonId: string): Promise<void> {
  const { team } = await requireTeamRole("member");

  const page = await findPageInTeam(pageId, team.id);
  if (!page) return;

  await db.delete(comparisons).where(and(eq(comparisons.id, comparisonId), eq(comparisons.pageId, pageId)));

  revalidatePath(`/projects/${page.projectSlug}/${pageId}`);
}
