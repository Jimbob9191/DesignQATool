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
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validations/auth";

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
