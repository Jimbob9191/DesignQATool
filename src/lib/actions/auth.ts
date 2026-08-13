"use server";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import {
  fieldErrorsFrom,
  friendlyAuthError,
  safeNext,
  submittedEmail,
  type AuthFormState,
} from "@/lib/auth/form-state";
import { sendEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";

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

export async function signUpWithPassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const rawEmail = submittedEmail(formData.get("email"));

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", email: rawEmail, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { status: "error", email, message: friendlyAuthError(error) };
  }

  // Supabase hides "email already registered" to prevent account enumeration:
  // it returns a decoy user with an empty identities array rather than an
  // error. That's the only signal that the address is taken.
  if (data.user && data.user.identities?.length === 0) {
    return {
      status: "error",
      email,
      message: "An account with that email already exists. Sign in instead.",
      fieldErrors: { email: "Already registered" },
    };
  }

  if (!data.user) {
    return { status: "error", email, message: "Could not create your account. Try again." };
  }

  // With "Confirm email" enabled on the project, signUp() returns no session
  // and Supabase emails a link instead. This deployment has no working
  // outbound email, so mark the address confirmed with the service-role key
  // and open the session using the password we just set.
  //
  // Trade-off: signup no longer proves the user owns the address. Acceptable
  // for an internal QA tool; revisit before opening signup to the public.
  if (!data.session) {
    const admin = createAdminClient();
    const { error: confirmError } = await admin.auth.admin.updateUserById(data.user.id, {
      email_confirm: true,
    });

    if (confirmError) {
      return { status: "error", email, message: confirmError.message };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { status: "error", email, message: friendlyAuthError(signInError) };
    }
  }

  redirect(safeNext(formData.get("next")));
}

/** Where the recovery link drops the user once the token has been verified. */
const RESET_PASSWORD_PATH = "/reset-password";

/**
 * Mints a recovery link and delivers it with Resend rather than calling
 * supabase.auth.resetPasswordForEmail(), which would hand delivery to
 * Supabase's built-in SMTP — the same outbound email that doesn't work on this
 * project (see signUpWithPassword). Resend is already the app's working mail
 * path for invites, so recovery rides on it too.
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

  // Build our own /auth/confirm URL instead of using data.properties.action_link.
  // action_link returns tokens in the URL fragment, which only client-side JS
  // can read; the token_hash flow verifies server-side in the route handler.
  const confirmUrl = new URL(`${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`);
  confirmUrl.searchParams.set("token_hash", data.properties.hashed_token);
  confirmUrl.searchParams.set("type", "recovery");
  confirmUrl.searchParams.set("next", RESET_PASSWORD_PATH);

  const sent = await sendEmail({
    to: email,
    subject: "Reset your Design QA Tool password",
    html: `
      <p>We got a request to reset the password for this Design QA Tool account.</p>
      <p><a href="${confirmUrl.toString()}">Choose a new password</a></p>
      <p>The link can only be used once and expires in about an hour. If you didn't ask for this, you can ignore this email — your password won't change.</p>
    `,
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

  redirect("/dashboard");
}

export async function signInWithGoogle(formData: FormData) {
  const next = formData.get("next");
  const callbackUrl = new URL(`${env.NEXT_PUBLIC_SITE_URL}/auth/callback`);
  if (typeof next === "string" && next) {
    callbackUrl.searchParams.set("next", next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in")}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
