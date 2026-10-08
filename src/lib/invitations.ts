import "server-only";

import { env } from "@/lib/env";

/**
 * The link an invitee follows to join. Always the canonical site URL, so the
 * link an admin copies from /team is the same one the email carries.
 */
export function invitationAcceptUrl(token: string): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/invite/accept?token=${token}`;
}
