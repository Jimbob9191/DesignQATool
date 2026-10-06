"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { authorizeTeamRole, isUuid, type ActionResult } from "@/lib/actions/result";
import { env } from "@/lib/env";
import { signComparisonExport } from "@/lib/exports/sign";
import { db } from "@/lib/db";
import { comparisons, pages, projects } from "@/lib/db/schema";

async function resolveOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host");
  if (!host) {
    return env.NEXT_PUBLIC_SITE_URL;
  }
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function exportComparisonPdf(
  comparisonId: string
): Promise<ActionResult<{ pdfBase64: string }>> {
  if (!isUuid(comparisonId)) return { success: false, error: "Comparison not found." };

  const auth = await authorizeTeamRole("viewer");
  if (!auth.success) return auth;
  const { team } = auth.data;

  if (!env.CAPTURE_SERVICE_URL || !env.CAPTURE_SERVICE_SECRET) {
    return { success: false, error: "Export is not configured." };
  }

  const [row] = await db
    .select({ teamId: projects.teamId })
    .from(comparisons)
    .innerJoin(pages, eq(comparisons.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(eq(comparisons.id, comparisonId))
    .limit(1);

  // Confirms the comparison belongs to the caller's current team — prevents
  // exporting another team's comparison by guessing its id, since the print
  // route itself trusts the HMAC signature alone, not a session.
  if (!row || row.teamId !== team.id) {
    return { success: false, error: "Comparison not found." };
  }

  const origin = await resolveOrigin();
  const { expires, signature } = signComparisonExport(comparisonId);
  const printUrl = `${origin}/print/comparison/${comparisonId}?expires=${expires}&sig=${signature}`;

  let response: Response;
  try {
    response = await fetch(`${env.CAPTURE_SERVICE_URL}/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CAPTURE_SERVICE_SECRET}`,
      },
      body: JSON.stringify({ url: printUrl }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { success: false, error: "The PDF took too long to render. Try again in a moment." };
    }
    console.error("[export] capture service unreachable:", error);
    return { success: false, error: "The PDF service is unavailable. Try again in a moment." };
  }

  // A cold-starting or overloaded Cloud Run instance answers 502/503 with an
  // HTML or plain-text body, so the JSON is only trusted once it parses.
  let data: { pdf?: string; error?: string } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    // Falls through to the status-based message below.
  }
  if (!response.ok || !data.pdf) {
    if (data.error) return { success: false, error: data.error };
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return { success: false, error: "The PDF service is unavailable. Try again in a moment." };
    }
    return { success: false, error: `PDF export failed (${response.status}).` };
  }

  return { success: true, data: { pdfBase64: data.pdf } };
}
