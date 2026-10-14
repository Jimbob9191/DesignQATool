import { ScanEye } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { loginErrorMessage } from "@/lib/auth/form-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error: errorCode, next } = await searchParams;
  const error = loginErrorMessage(errorCode);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <p className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
        Early alpha v0.0.1 · works on my machine™
      </p>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanEye className="h-5 w-5" />
          </div>
          <CardTitle>Sign in to DesignParity.app</CardTitle>
          <CardDescription>Compare designs against the live site, side by side.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
