import { ScanEye } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Reached by following the recovery link, which verifies the token and opens a
// session before redirecting here — so middleware's signed-in check is what
// keeps this page from being useful to anyone without a valid link.
//
// `setup` is the same form reached from the signup confirmation link: new
// accounts get their first password here (see signUp in actions/auth.ts).
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string; next?: string }>;
}) {
  const { error, setup, next } = await searchParams;
  const isSetup = setup === "1";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanEye className="h-5 w-5" />
        </div>
        <CardTitle>{isSetup ? "Choose your password" : "Choose a new password"}</CardTitle>
        <CardDescription>
          {isSetup
            ? "Your email is confirmed. Set a password to finish creating your account."
            : "You'll stay signed in on this device once it's set."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <ResetPasswordForm next={next} isSetup={isSetup} />
      </CardContent>
    </Card>
  );
}
