// Every email the app sends, as pure functions returning subject + HTML +
// plain-text bodies. Kept free of server-only imports and path aliases so the
// tests can import it directly.
//
// Anything user-supplied (comment bodies, team names, display names) MUST go
// through escapeHtml before landing in the HTML body — mail clients render it.

export type EmailContent = { subject: string; html: string; text: string };

const PRODUCT_NAME = "DesignParity.app";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wraps pre-escaped paragraphs and a single call-to-action in a minimal,
 * client-safe layout (inline styles only; no external CSS or images).
 */
function layout(input: { paragraphs: string[]; action: { label: string; url: string }; footer?: string }): string {
  const url = escapeHtml(input.action.url);
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#18181b;">${p}</p>`)
    .join("");
  const footer = input.footer
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#71717a;">${input.footer}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <p style="margin:0 0 24px;font-size:14px;font-weight:600;color:#18181b;">${PRODUCT_NAME}</p>
      ${body}
      <p style="margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 16px;border-radius:6px;">${escapeHtml(input.action.label)}</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">Or paste this link into your browser:<br /><a href="${url}" style="color:#71717a;word-break:break-all;">${url}</a></p>
      ${footer}
    </div>
  </body>
</html>`;
}

export function signupConfirmationEmail(input: { confirmUrl: string }): EmailContent {
  return {
    subject: `Confirm your ${PRODUCT_NAME} account`,
    html: layout({
      paragraphs: [`Thanks for signing up. Confirm your email address, then choose a password to finish creating your account.`],
      action: { label: "Confirm email address", url: input.confirmUrl },
      footer: "If you didn't create an account, you can ignore this email.",
    }),
    text: [
      `Thanks for signing up for ${PRODUCT_NAME}. Confirm your email address, then choose a password to finish creating your account:`,
      "",
      input.confirmUrl,
      "",
      "If you didn't create an account, you can ignore this email.",
    ].join("\n"),
  };
}

export function passwordResetEmail(input: { resetUrl: string }): EmailContent {
  return {
    subject: `Reset your ${PRODUCT_NAME} password`,
    html: layout({
      paragraphs: [`We got a request to reset the password for this ${PRODUCT_NAME} account.`],
      action: { label: "Choose a new password", url: input.resetUrl },
      footer:
        "The link can only be used once and expires in about an hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    }),
    text: [
      `We got a request to reset the password for this ${PRODUCT_NAME} account. Choose a new password here:`,
      "",
      input.resetUrl,
      "",
      "The link can only be used once and expires in about an hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    ].join("\n"),
  };
}

export function invitationEmail(input: {
  inviterLabel: string;
  teamName: string;
  role: string;
  acceptUrl: string;
}): EmailContent {
  const inviter = escapeHtml(input.inviterLabel);
  const team = escapeHtml(input.teamName);
  const role = escapeHtml(input.role);
  return {
    subject: `You've been invited to join ${input.teamName} on ${PRODUCT_NAME}`,
    html: layout({
      paragraphs: [
        `${inviter} invited you to join <strong>${team}</strong> as a <strong>${role}</strong> on ${PRODUCT_NAME}.`,
      ],
      action: { label: "Accept the invitation", url: input.acceptUrl },
      footer: "This link expires in 7 days.",
    }),
    text: [
      `${input.inviterLabel} invited you to join ${input.teamName} as a ${input.role} on ${PRODUCT_NAME}.`,
      "",
      `Accept the invitation: ${input.acceptUrl}`,
      "",
      "This link expires in 7 days.",
    ].join("\n"),
  };
}

export function commentNotificationEmail(input: {
  authorLabel: string;
  reason: "mention" | "reply";
  commentBody: string;
  url: string;
}): EmailContent {
  const verb = input.reason === "mention" ? "mentioned you" : "replied";
  return {
    subject: `${input.authorLabel} ${verb} on ${PRODUCT_NAME}`,
    html: layout({
      paragraphs: [
        `${escapeHtml(input.authorLabel)} ${verb} on a pin:`,
        `<span style="display:block;border-left:3px solid #e4e4e7;padding-left:12px;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(input.commentBody)}</span>`,
      ],
      action: { label: "View the comparison", url: input.url },
      footer: "You can change which notifications you get in your account settings.",
    }),
    text: [
      `${input.authorLabel} ${verb} on a pin:`,
      "",
      input.commentBody,
      "",
      `View the comparison: ${input.url}`,
    ].join("\n"),
  };
}
