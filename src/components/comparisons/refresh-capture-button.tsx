"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { refreshComparisonCapture } from "@/lib/actions/annotations";
import { Button } from "@/components/ui/button";

export function RefreshCaptureButton({
  comparisonId,
  newCaptureAssetId,
}: {
  comparisonId: string;
  newCaptureAssetId: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setIsSubmitting(true);
    const result = await refreshComparisonCapture(comparisonId, newCaptureAssetId);
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const { reresolved, needsReview } = result.data;
    toast.success(
      needsReview > 0
        ? `Updated. ${reresolved} pin${reresolved === 1 ? "" : "s"} re-resolved, ${needsReview} need${needsReview === 1 ? "s" : ""} review.`
        : `Updated. ${reresolved} pin${reresolved === 1 ? "" : "s"} re-resolved.`
    );
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isSubmitting}>
      <RefreshCw className="h-4 w-4" />
      Update to latest capture
    </Button>
  );
}
