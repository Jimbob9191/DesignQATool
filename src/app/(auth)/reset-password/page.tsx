import { ScanEye } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Reached by following the recovery link, which verifies the token and opens a
// session before redirecting here — so middleware's signed-in check is what
// keeps this page from being useful to anyone without a valid link.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanEye className="h-5 w-5" />
        </div>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll stay signed in on this device once it&apos;s set.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
