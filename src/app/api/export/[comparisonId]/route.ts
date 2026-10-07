import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { authorizeTeamRole, isUuid } from "@/lib/actions/result";
import { getAppOrigin } from "@/lib/app-origin";
import { db } from "@/lib/db";
import { comparisons, pages, projects } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { signComparisonExport } from "@/lib/exports/sign";

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** `attachment` with an ASCII fallback name plus the exact name for browsers that read filename*. */
function contentDisposition(name: string): string {
  const base = name.trim() || "comparison";
  const ascii = base.replace(/[^a-z0-9-_ ]+/gi, "-").replace(/\s+/g, " ");
  // encodeURIComponent leaves ' ( ) * alone, but RFC 5987 doesn't allow them.
  const encoded = encodeURIComponent(`${base}.pdf`).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encoded}`;
}

// Renders the comparison's print page to PDF through capture-service and
// streams the bytes straight through, so neither the server nor the browser
// handles a base64 copy. Middleware already turns away signed-out requests.
export async function GET(_request: Request, { params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  if (!isUuid(comparisonId)) return errorResponse("Comparison not found.", 404);

  const auth = await authorizeTeamRole("viewer");
  if (!auth.success) return errorResponse(auth.error, 403);
  const { team } = auth.data;

  if (!env.CAPTURE_SERVICE_URL || !env.CAPTURE_SERVICE_SECRET) {
    return errorResponse("Export is not configured.", 503);
  }

  const [row] = await db
    .select({ teamId: projects.teamId, name: comparisons.name })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(eq(comparisons.id, comparisonId))
    .limit(1);

  // Confirms the comparison belongs to the caller's current team — prevents
  // exporting another team's comparison by guessing its id, since the print
  // route itself trusts the HMAC signature alone, not a session.
  if (!row || row.teamId !== team.id) {
    return errorResponse("Comparison not found.", 404);
  }

  const origin = await getAppOrigin();
  const { expires, signature } = signComparisonExport(comparisonId);
  const printUrl = `${origin}/print/comparison/${comparisonId}?expires=${expires}&sig=${signature}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${env.CAPTURE_SERVICE_URL}/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
        Authorization: `Bearer ${env.CAPTURE_SERVICE_SECRET}`,
      },
      body: JSON.stringify({ url: printUrl }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse("The PDF took too long to render. Try again in a moment.", 504);
    }
    console.error("[export] capture service unreachable:", error);
    return errorResponse("The PDF service is unavailable. Try again in a moment.", 503);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": contentDisposition(row.name),
    "Cache-Control": "private, no-store",
  };

  if (upstream.ok && contentType.startsWith("application/pdf") && upstream.body) {
    const length = upstream.headers.get("content-length");
    return new Response(upstream.body, { headers: length ? { ...headers, "Content-Length": length } : headers });
  }

  // A cold-starting or overloaded Cloud Run instance answers 502/503 with an
  // HTML or plain-text body, so the JSON is only trusted once it parses. A
  // capture-service deployed before it learned to send raw bytes still
  // answers with base64 JSON, which is decoded here until it's redeployed.
  let data: { pdf?: string; error?: string } = {};
  try {
    data = (await upstream.json()) as typeof data;
  } catch {
    // Falls through to the status-based message below.
  }
  if (upstream.ok && data.pdf) {
    return new Response(Buffer.from(data.pdf, "base64"), { headers });
  }
  if (data.error) return errorResponse(data.error, 502);
  if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
    return errorResponse("The PDF service is unavailable. Try again in a moment.", 503);
  }
  return errorResponse(`PDF export failed (${upstream.status}).`, 502);
}
