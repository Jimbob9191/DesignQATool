import { ScanEye } from "lucide-react";

import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanEye className="h-5 w-5" />
        </div>
        <CardTitle>Create your Design QA account</CardTitle>
        <CardDescription>You&apos;ll get a personal team to start working in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <SignupForm next={next} />
      </CardContent>
    </Card>
  );
}
