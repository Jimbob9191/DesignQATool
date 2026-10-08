import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// bridge.js is loaded by the sites under review, for their visitors — it must
// never bounce to /login, and needs no session. Nor does Retune's manifest,
// which its dev overlay fetches on every page, signed in or not.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|bridge\\.js$|retune\\.manifest\\.json$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
