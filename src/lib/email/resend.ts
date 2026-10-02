import "server-only";

import { Resend } from "resend";

import type { EmailContent } from "@/lib/email/templates";
import { env } from "@/lib/env";

// resend.dev is Resend's sandbox sender: it works without verifying a domain
// but only delivers to the Resend account owner's own address. Set EMAIL_FROM
// to an address on a domain verified in Resend for real delivery.
const SANDBOX_FROM_ADDRESS = "Design QA Tool <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(input: { to: string } & EmailContent): Promise<
  { sent: true } | { sent: false; error: string }
> {
  const resend = getClient();
  if (!resend) {
    // Without this, local signup would be a dead end: the confirmation link
    // only exists inside the email. Print it so a developer can click through.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[email] RESEND_API_KEY not set — would have sent to ${input.to}:\n` +
          `Subject: ${input.subject}\n\n${input.text}\n`
      );
    }
    return { sent: false, error: "Email is not configured (RESEND_API_KEY missing)." };
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM ?? SANDBOX_FROM_ADDRESS,
    replyTo: env.EMAIL_REPLY_TO,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    return { sent: false, error: error.message };
  }
  return { sent: true };
}
