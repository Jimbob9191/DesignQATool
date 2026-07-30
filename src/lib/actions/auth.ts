"use server";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validations/auth";

export type SendMagicLinkState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prevState: SendMagicLinkState,
  formData: FormData
): Promise<SendMagicLinkState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const next = formData.get("next");
  const confirmUrl = new URL(`${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`);
  if (typeof next === "string" && next) {
    confirmUrl.searchParams.set("next", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: confirmUrl.toString(),
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "success", message: `Check ${parsed.data.email} for a sign-in link.` };
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
