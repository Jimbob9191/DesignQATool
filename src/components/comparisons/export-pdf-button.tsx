"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ExportPdfButton({
  comparisonId,
  comparisonName,
}: {
  comparisonId: string;
  comparisonName: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  // A fetch rather than a bare link so the button can show progress while the
  // PDF renders (it takes several seconds) and turn a failure into a toast
  // instead of navigating to a JSON error.
  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/export/${comparisonId}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `PDF export failed (${response.status}).`);
        return;
      }

      // A session that expired meanwhile is redirected to the login page,
      // which arrives as a 200 HTML response rather than an error.
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
        toast.error("Your session has expired. Sign in again to export.");
        return;
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${comparisonName.replace(/[^a-z0-9-_]+/gi, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={isExporting}>
      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export PDF
    </Button>
  );
}
