import "server-only";

import { z } from "zod";

import { getCurrentTeam, hasTeamRole, type TeamRole } from "@/lib/auth/team";

// Deliberately not "use server": these are helpers for the action files, not
// actions a client could call.

// Every Server Action reports expected failures (bad input, wrong role, not
// found) by returning this rather than throwing. In production Next replaces a
// thrown message with a generic "An error occurred in the Server Components
// render", so a thrown error never reaches the user as anything useful.
export type ActionResult<T> =
  | { success: true; data: T; warning?: string }
  | { success: false; error: string };

export const NO_PERMISSION = "You don't have permission to do that.";

/**
 * The caller's current team membership, provided their role there is at least
 * `minRole`; otherwise a failed ActionResult the action can return as-is.
 */
export async function authorizeTeamRole(
  minRole: TeamRole
): Promise<ActionResult<Awaited<ReturnType<typeof getCurrentTeam>>>> {
  const membership = await getCurrentTeam();
  if (!hasTeamRole(membership.role, minRole)) {
    return { success: false, error: NO_PERMISSION };
  }
  return { success: true, data: membership };
}

const uuidSchema = z.uuid();

/**
 * Whether every value is a well-formed uuid. Ids reach actions as plain
 * strings from the client, and Postgres throws (22P02) on a malformed one
 * instead of simply matching no rows, so check them before they hit a query.
 */
export function isUuid(...values: unknown[]): boolean {
  return values.every((value) => uuidSchema.safeParse(value).success);
}
