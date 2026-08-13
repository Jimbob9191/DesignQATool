"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck, Send } from "lucide-react";

import { requestPasswordReset } from "@/lib/actions/auth";
import { initialAuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialAuthState);

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // Sending doesn't navigate anywhere, so the form swaps itself out for the
  // confirmation. Re-requesting means coming back via "Back to sign in".
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
        <Button asChild variant="outline">
          <Link href={loginHref}>Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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

        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send reset link
        </Button>

        {state.status === "error" && state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
