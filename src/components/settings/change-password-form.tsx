"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { changePassword } from "@/lib/actions/account";
import { initialAuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(changePassword, initialAuthState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />

      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
          required
        />
        {state.fieldErrors?.currentPassword ? (
          <p className="text-sm text-destructive">{state.fieldErrors.currentPassword}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          required
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
        ) : (
          <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          required
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Change password
      </Button>

      {state.status === "error" && state.message ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
