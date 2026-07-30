import type { ElementMapEntry } from "./hit-test";

export type ElementRect = { x: number; y: number; width: number; height: number };

export type ResolveInput = {
  xRatio: number;
  yPx: number;
  elementSelector: string | null;
  elementRect: ElementRect | null;
  imageWidth: number;
};

export type ResolveResult = {
  xRatio: number;
  yPx: number;
  elementRect: ElementRect | null;
  needsReview: boolean;
};

/**
 * Re-resolves an annotation's position against a fresh element map after a
 * re-capture. If the stored selector still appears in the new element map,
 * the pin is repositioned by re-applying its original *relative* offset
 * within that element's bounding box (so it tracks the element even if the
 * element itself moved). If the selector doesn't resolve — or the
 * annotation was coordinate-only to begin with — the old x_ratio/y_px is
 * kept as a fallback and the pin is flagged needs_review rather than lost,
 * per the project's pin-drift policy.
 */
export function resolveAnnotationForNewCapture(
  input: ResolveInput,
  newElementMap: ElementMapEntry[]
): ResolveResult {
  const fallback: ResolveResult = {
    xRatio: input.xRatio,
    yPx: input.yPx,
    elementRect: input.elementRect,
    needsReview: true,
  };

  if (!input.elementSelector || !input.elementRect) {
    return fallback;
  }

  const newEntry = newElementMap.find((entry) => entry.selector === input.elementSelector);
  if (!newEntry) {
    return fallback;
  }

  const oldRect = input.elementRect;
  const oldPointX = input.xRatio * input.imageWidth;
  const oldPointY = input.yPx;
  const offsetXRatio = oldRect.width > 0 ? (oldPointX - oldRect.x) / oldRect.width : 0.5;
  const offsetYRatio = oldRect.height > 0 ? (oldPointY - oldRect.y) / oldRect.height : 0.5;

  const newPointX = newEntry.rect.x + offsetXRatio * newEntry.rect.width;
  const newPointY = newEntry.rect.y + offsetYRatio * newEntry.rect.height;

  return {
    xRatio: newPointX / input.imageWidth,
    yPx: newPointY,
    elementRect: newEntry.rect,
    needsReview: false,
  };
}
