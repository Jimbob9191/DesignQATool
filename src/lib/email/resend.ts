import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";

// resend.dev is Resend's sandbox sender — works without verifying a domain,
// but only for testing. Swap in a verified domain's address before relying
// on this for real delivery to arbitrary invitee addresses.
const FROM_ADDRESS = "Design QA Tool <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<
  { sent: true } | { sent: false; error: string }
> {
  const resend = getClient();
  if (!resend) {
    return { sent: false, error: "Email is not configured (RESEND_API_KEY missing)." };
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    return { sent: false, error: error.message };
  }
  return { sent: true };
}
