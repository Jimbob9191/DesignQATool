import "server-only";

import { env } from "@/lib/env";

import { PRESET_VIEWPORTS, type ElementMapEntry, type PresetViewport } from "./constants";

export type CaptureServiceResult = {
  image: string; // base64
  mime: string;
  width: number;
  height: number;
  elementMap: ElementMapEntry[];
};

export async function callCaptureService(input: {
  url: string;
  viewportWidth: PresetViewport;
  deviceScaleFactor?: number;
}): Promise<CaptureServiceResult> {
  if (!env.CAPTURE_SERVICE_URL || !env.CAPTURE_SERVICE_SECRET) {
    throw new Error("Capture service is not configured.");
  }

  const response = await fetch(`${env.CAPTURE_SERVICE_URL}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CAPTURE_SERVICE_SECRET}`,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(65_000),
  });

  const data = (await response.json()) as CaptureServiceResult & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Capture service returned ${response.status}`);
  }

  return data;
}

export { PRESET_VIEWPORTS };
export type { PresetViewport };
