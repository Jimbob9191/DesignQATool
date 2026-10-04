// Shown wherever content's author account has been deleted. created_by on
// shared content is ON DELETE SET NULL (see migration 0021), so the work
// outlives the person; guest comments have a guest_name instead and never
// fall through to this.
export const FORMER_MEMBER = "Former member";
