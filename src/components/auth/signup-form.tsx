"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck, UserPlus } from "lucide-react";

import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { signUpWithPassword } from "@/lib/actions/auth";
import { initialAuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signUpWithPassword, initialAuthState);

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // The account isn't usable until the emailed link is clicked, so the form
  // swaps itself out for a "check your inbox" confirmation.
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-center"
          role="status"
        >
          <MailCheck className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or sign up again with the same email to resend it.
        </p>
        <Button asChild variant="outline">
          <Link href={loginHref}>Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GoogleButton next={next} />
      <AuthDivider />

      <form action={formAction} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={state.email ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            required
          />
          {state.fieldErrors?.email ? (
            <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={PASSWORD_MIN_LENGTH}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            required
          />
          {state.fieldErrors?.password ? (
            <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            required
          />
          {state.fieldErrors?.confirmPassword ? (
            <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword}</p>
          ) : null}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Create account
        </Button>

        {state.status === "error" && state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
