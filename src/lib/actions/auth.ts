"use server";

import { randomBytes } from "node:crypto";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import {
  fieldErrorsFrom,
  friendlyAuthError,
  safeNext,
  submittedEmail,
  TOO_MANY_ATTEMPTS,
  type AuthFormState,
} from "@/lib/auth/form-state";
import { sendEmail } from "@/lib/email/resend";
import { clientIp, consumePasswordAttempt, consumeRateLimits } from "@/lib/rate-limit";
import { passwordResetEmail, signupConfirmationEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export async function signInWithPassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = submittedEmail(formData.get("email"));

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", email, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (!(await consumePasswordAttempt(parsed.data.email))) {
    return { status: "error", email, message: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { status: "error", email, message: friendlyAuthError(error) };
  }

  // Outside any try/catch: redirect() signals by throwing.
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const rawEmail = submittedEmail(formData.get("email"));

  const parsed = signUpSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { status: "error", email: rawEmail, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email } = parsed.data;
  const next = safeNext(formData.get("next"));

  // Every signup sends an email, so without a cap this form could be used to
  // flood any inbox from our domain and burn the Resend quota.
  const ip = await clientIp();
  const allowed = await consumeRateLimits([
    [`signup:ip:${ip}`, 10, HOUR],
    [`signup:email:${email.toLowerCase()}`, 3, HOUR],
  ]);
  if (!allowed) {
    return { status: "error", email, message: TOO_MANY_ATTEMPTS };
  }

  // generateLink({ type: "signup" }) creates the unconfirmed user and mints a
  // confirmation token WITHOUT sending anything, so delivery goes through
  // Resend like every other email. supabase.auth.signUp() would hand delivery
  // to Supabase's built-in SMTP, which only reaches the project's own team.
  //
  // For an address that already signed up but never confirmed, this mints a
  // fresh token for the existing user instead, so "sign up again" doubles as
  // "resend the confirmation email".
  //
  // The password is random and never shown to anyone: the real one is chosen
  // after the link is clicked (see emailLinkUrl's next below), once the person
  // has proved they own the mailbox.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: unguessablePassword(),
  });

  if (error) {
    if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) {
      return {
        status: "error",
        email,
        message: "An account with that email already exists. Sign in instead.",
        fieldErrors: { email: "Already registered" },
      };
    }
    return { status: "error", email, message: friendlyAuthError(error) };
  }

  if (!data.properties?.hashed_token) {
    return { status: "error", email, message: "Could not create your account. Try again." };
  }

  // generateLink keeps an existing unconfirmed user's password, which may have
  // been set by someone else (or by the old flow, which took a password at
  // signup). Overwrite it so whoever confirms is the only one who can get in.
  const { error: resetError } = await admin.auth.admin.updateUserById(data.user.id, {
    password: unguessablePassword(),
  });
  if (resetError) {
    console.error("[auth] could not reset unconfirmed user's password:", resetError.message);
    return { status: "error", email, message: "Could not create your account. Try again." };
  }

  const sent = await sendEmail({
    to: email,
    ...signupConfirmationEmail({
      confirmUrl: emailLinkUrl(data.properties.hashed_token, "signup", setPasswordPath(next)),
    }),
  });

  if (!sent.sent) {
    console.error("[auth] signup confirmation email failed to send:", sent.error);
    return {
      status: "error",
      email,
      message: "We couldn't send your confirmation email. Wait a minute and try again.",
    };
  }

  return {
    status: "success",
    email,
    message: `We sent a confirmation link to ${email}. Open it to finish creating your account.`,
  };
}

/**
 * Where the recovery link drops the user once the token has been verified —
 * and, in setup mode, where a newly confirmed user picks their first password.
 */
const RESET_PASSWORD_PATH = "/reset-password";

/** A password nobody knows, for accounts whose real one isn't chosen yet. */
function unguessablePassword(): string {
  return randomBytes(32).toString("base64url");
}

/** The confirmed user's first stop: choose a password, then carry on to `next`. */
function setPasswordPath(next: string): string {
  return `${RESET_PASSWORD_PATH}?setup=1&next=${encodeURIComponent(next)}`;
}

/**
 * Builds the /auth/confirm link that goes in an email. Deliberately not the
 * action_link generateLink() returns: that one hands tokens back in the URL
 * fragment, which only client-side JS can read, whereas token_hash is
 * verified server-side in the route handler and sets the session cookie.
 */
function emailLinkUrl(tokenHash: string, type: EmailOtpType, next: string): string {
  const url = new URL(`${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

/**
 * Mints a recovery link and delivers it with Resend rather than calling
 * supabase.auth.resetPasswordForEmail(), which would hand delivery to
 * Supabase's built-in SMTP (see signUpWithPassword).
 *
 * Returns nothing on purpose: every outcome, including "no such account",
 * looks identical to the caller.
 */
async function deliverPasswordResetEmail(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });

  if (error || !data.properties?.hashed_token) {
    // Almost always "user not found". Logged for operators, never surfaced:
    // a visible difference here would make this form an account-enumeration
    // oracle for anyone who can type an address into it.
    console.warn("[auth] no recovery link generated:", error?.message ?? "token missing");
    return;
  }

  const sent = await sendEmail({
    to: email,
    ...passwordResetEmail({
      resetUrl: emailLinkUrl(data.properties.hashed_token, "recovery", RESET_PASSWORD_PATH),
    }),
  });

  if (!sent.sent) {
    console.error("[auth] password reset email failed to send:", sent.error);
  }
}

export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = submittedEmail(formData.get("email"));

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", email, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Applied before looking the account up, so being throttled says nothing
  // about whether the address is registered.
  const ip = await clientIp();
  const allowed = await consumeRateLimits([
    [`reset:ip:${ip}`, 10, HOUR],
    [`reset:email:${parsed.data.email.toLowerCase()}`, 3, HOUR],
  ]);
  if (!allowed) {
    return { status: "error", email, message: TOO_MANY_ATTEMPTS };
  }

  await deliverPasswordResetEmail(parsed.data.email);

  // Unconditionally the same answer whether or not the account exists.
  return {
    status: "success",
    email: parsed.data.email,
    message: `If an account exists for ${parsed.data.email}, a reset link is on its way. It expires in about an hour.`,
  };
}

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();

  // Verifying the recovery token signed the user in. No session means the link
  // expired or was already used, and updateUser() would fail with a message
  // that doesn't explain what to do next.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: "That reset link has expired or was already used. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: friendlyAuthError(error) };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
