import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { parseEmailOtpType, safeNext, type LoginErrorCode } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseEmailOtpType(searchParams.get("type"));
  // safeNext, not the raw param: this URL is emailed around, and redirect()
  // would happily follow an absolute "next" straight off-site.
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  const error: LoginErrorCode = "link_invalid";
  redirect(`/login?error=${error}`);
}
