// Shown wherever content's author account has been deleted. created_by on
// shared content is ON DELETE SET NULL (see migration 0021), so the work
// outlives the person; guest comments have a guest_name instead and never
// fall through to this.
export const FORMER_MEMBER = "Former member";

// Guests comment through share links under a name they type themselves, so
// it's labelled to stop a guest passing as a team member.
export function guestAuthor(guestName: string): string {
  return `${guestName} (guest)`;
}
