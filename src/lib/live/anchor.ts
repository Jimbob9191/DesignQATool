import type { PinAnchor, Rect } from "./protocol";

/**
 * A live-site pin is stored like a capture pin — x_ratio/y_px in document
 * space plus the element's rect when it was placed — so its position within
 * that element (the part the bridge re-applies to wherever the element is
 * now) is derived the same way resolveAnnotationForNewCapture does.
 */
export function pinAnchorFor(
  annotation: {
    id: string;
    xRatio: number;
    yPx: number;
    elementSelector: string | null;
    elementRect: Rect | null;
    elementText: string | null;
  },
  viewportWidth: number
): PinAnchor {
  const docX = annotation.xRatio * viewportWidth;
  const docY = annotation.yPx;
  const rect = annotation.elementRect;
  return {
    id: annotation.id,
    selector: annotation.elementSelector,
    text: annotation.elementText,
    offsetX: rect && rect.width > 0 ? clamp01((docX - rect.x) / rect.width) : 0.5,
    offsetY: rect && rect.height > 0 ? clamp01((docY - rect.y) / rect.height) : 0.5,
    docX,
    docY,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
