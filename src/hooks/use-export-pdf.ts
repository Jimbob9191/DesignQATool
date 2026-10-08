"use client";

import { useState } from "react";
import { toast } from "sonner";

export function useExportPdf(comparisonId: string, comparisonName: string) {
  const [isExporting, setIsExporting] = useState(false);

  // A fetch rather than a bare link so progress can show while the PDF renders
  // (it takes several seconds) and a failure becomes a toast instead of
  // navigating to a JSON error.
  async function exportPdf() {
    setIsExporting(true);
    const toastId = toast.loading("Exporting PDF…");
    try {
      const response = await fetch(`/api/export/${comparisonId}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `PDF export failed (${response.status}).`, { id: toastId });
        return;
      }

      // A session that expired meanwhile is redirected to the login page,
      // which arrives as a 200 HTML response rather than an error.
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
        toast.error("Your session has expired. Sign in again to export.", { id: toastId });
        return;
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${comparisonName.replace(/[^a-z0-9-_]+/gi, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exported", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  }

  return { exportPdf, isExporting };
}
