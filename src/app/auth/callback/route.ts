import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Supabase echoes our own redirectTo query back, but the callback URL is
  // still reachable directly, so `next` gets the same treatment as every
  // other redirect target rather than being trusted as ours.
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not sign in with Google.")}`
  );
}
