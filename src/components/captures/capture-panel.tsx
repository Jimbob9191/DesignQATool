"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { startCapture } from "@/lib/actions/captures";
import { PRESET_VIEWPORTS, type PresetViewport } from "@/lib/capture/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VIEWPORT_LABELS: Record<PresetViewport, string> = {
  390: "390px — Mobile",
  768: "768px — Tablet",
  1440: "1440px — Desktop",
};

export function CapturePanel({
  pageId,
  defaultUrl,
  hasPendingCapture,
}: {
  pageId: string;
  defaultUrl: string;
  hasPendingCapture: boolean;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [viewportWidth, setViewportWidth] = useState<PresetViewport>(1440);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hasPendingCapture && !pollRef.current) {
      pollRef.current = setInterval(() => router.refresh(), 2000);
    }
    if (!hasPendingCapture && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasPendingCapture, router]);

  async function handleCapture() {
    setIsSubmitting(true);
    const result = await startCapture({ pageId, url, viewportWidth });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Capture started");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-1 flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="capture-url">
          URL to capture
        </label>
        <Input
          id="capture-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/pricing"
        />
      </div>
      <Select
        value={String(viewportWidth)}
        onValueChange={(v) => setViewportWidth(Number(v) as PresetViewport)}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_VIEWPORTS.map((width) => (
            <SelectItem key={width} value={String(width)}>
              {VIEWPORT_LABELS[width]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleCapture} disabled={isSubmitting || !url}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        Capture
      </Button>
    </div>
  );
}
