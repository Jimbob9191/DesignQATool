import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// bridge.js is loaded by the sites under review, for their visitors — it must
// never bounce to /login, and needs no session.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|bridge\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
