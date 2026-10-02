// Pure helpers behind the auth Server Actions. These deliberately live outside
// src/lib/actions/auth.ts: a "use server" module may only export async
// functions, so constants and sync helpers cannot be exported from there.
// Keeping them here also makes them directly unit-testable.

import type { AuthError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type AuthField = "email" | "password" | "confirmPassword";

export type AuthFormState = {
  /**
   * "success" is only used by forms that finish without navigating away —
   * signup and the reset request, which both stay put and tell the user to
   * check their inbox rather than redirecting. Actions that end in redirect()
   * never return at all, so they only ever produce "idle" or "error".
   */
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  /**
   * The submitted email, echoed back so the field can be repopulated. React 19
   * resets a form once its action resolves, so without this a failed sign-in
   * would make the user retype their address. Passwords are deliberately never
   * echoed back.
   */
  email?: string;
};

export const initialAuthState: AuthFormState = { status: "idle" };

/** First error message per field, in Zod's issue order. */
export function fieldErrorsFrom(error: ZodError): Partial<Record<AuthField, string>> {
  const fieldErrors: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as AuthField] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Supabase's messages are written for developers ("Invalid login
 * credentials"); surface something a signed-out human can act on instead.
 */
export function friendlyAuthError(error: Pick<AuthError, "message" | "status">): string {
  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "That email or password is incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "That account still needs confirming. Check your inbox for the confirmation link, or sign up again to get a new one.";
  }
  if (message.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }
  // supabase-js wraps DNS/connection failures as a retryable fetch error; the
  // raw "fetch failed" text tells the user nothing actionable.
  if (message.includes("fetch failed") || message.includes("failed to fetch")) {
    return "Can't reach the authentication service right now. Check your connection and try again.";
  }
  return error.message;
}

/** The raw email as typed, for echoing back into a rejected form. */
export function submittedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `next` arrives from a query string, so it is attacker-controllable. Only
 * same-origin absolute paths pass through — "//evil.com" is a
 * protocol-relative URL that would otherwise redirect off-site, and browsers
 * read "/\evil.com" the same way.
 */
export function safeNext(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/") && !/^\/[/\\]/.test(value)) {
    return value;
  }
  return "/dashboard";
}
