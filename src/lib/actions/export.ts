"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { requireTeamRole } from "@/lib/auth/team";
import { env } from "@/lib/env";
import { signComparisonExport } from "@/lib/exports/sign";
import { db } from "@/lib/db";
import { comparisons, pages, projects } from "@/lib/db/schema";

type ActionResult = { success: true; pdfBase64: string } | { success: false; error: string };

async function resolveOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host");
  if (!host) {
    return env.NEXT_PUBLIC_SITE_URL;
  }
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function exportComparisonPdf(comparisonId: string): Promise<ActionResult> {
  const { team } = await requireTeamRole("viewer");

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

  const response = await fetch(`${env.CAPTURE_SERVICE_URL}/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CAPTURE_SERVICE_SECRET}`,
    },
    body: JSON.stringify({ url: printUrl }),
    signal: AbortSignal.timeout(35_000),
  });

  const data = (await response.json()) as { pdf?: string; error?: string };
  if (!response.ok || !data.pdf) {
    return { success: false, error: data.error ?? `PDF export failed (${response.status})` };
  }

  return { success: true, pdfBase64: data.pdf };
}
