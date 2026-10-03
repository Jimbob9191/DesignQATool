"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { updatePassword } from "@/lib/actions/auth";
import { initialAuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";

export function ResetPasswordForm({ next, isSetup = false }: { next?: string; isSetup?: boolean }) {
  const [state, formAction, isPending] = useActionState(updatePassword, initialAuthState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{isSetup ? "Password" : "New password"}</Label>
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
          <Label htmlFor="confirmPassword">{isSetup ? "Confirm password" : "Confirm new password"}</Label>
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
            <KeyRound className="h-4 w-4" />
          )}
          {isSetup ? "Set password" : "Update password"}
        </Button>

        {state.status === "error" && state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Link stopped working?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Request a new one
        </Link>
      </p>
    </div>
  );
}
