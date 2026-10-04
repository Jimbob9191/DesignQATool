import { NextResponse, type NextRequest } from "next/server";

import { getCurrentTeam } from "@/lib/auth/team";
import { toSearchItems } from "@/lib/search/items";
import { searchTeam } from "@/lib/search/queries";

// Backs the topbar's as-you-type results. Middleware already turns away
// signed-out requests; getCurrentTeam() scopes everything to the caller's
// current team.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const { team } = await getCurrentTeam();
  const results = await searchTeam(team.id, q, { limit: 5 });

  return NextResponse.json(
    { query: results.query, terms: results.terms, items: toSearchItems(results) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
