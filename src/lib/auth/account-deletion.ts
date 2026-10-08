// Pure planning step behind deleteAccount(), kept out of the "use server"
// module so it can be unit-tested.

export type AccountMembership = {
  teamId: string;
  teamName: string;
  role: "owner" | "admin" | "member" | "viewer";
  memberCount: number;
  ownerCount: number;
};

export type AccountDeletionPlan =
  | { ok: false; blockingTeamNames: string[] }
  | { ok: true; soleMemberTeamIds: string[] };

/**
 * Decides what deleting an account means for each of the user's teams:
 *
 * - The user is the team's only member: the team goes with them. Nobody else
 *   could ever reach it again.
 * - The user is the only owner but there are other members: refuse. Deleting
 *   would strand a team nobody can manage, so they must hand over ownership
 *   (or remove everyone else) first.
 * - Anything else: their membership simply cascades away with the user.
 */
export function planAccountDeletion(memberships: AccountMembership[]): AccountDeletionPlan {
  const blockingTeamNames = memberships
    .filter((m) => m.memberCount > 1 && m.role === "owner" && m.ownerCount === 1)
    .map((m) => m.teamName);

  if (blockingTeamNames.length > 0) {
    return { ok: false, blockingTeamNames };
  }

  return {
    ok: true,
    soleMemberTeamIds: memberships.filter((m) => m.memberCount === 1).map((m) => m.teamId),
  };
}

/** Joins team names for a sentence: "A", "A and B", "A, B and C". */
export function listTeamNames(names: string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}
