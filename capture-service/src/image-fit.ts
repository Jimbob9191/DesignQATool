// WebP stores width and height as 14-bit values, so neither dimension may
// exceed 16383px. A full-page screenshot of a long marketing page blows
// straight past that (MAX_PAGE_HEIGHT_PX alone is 20000), and sharp's encoder
// rejects it with "Processed image is too large for the WebP format".
export const WEBP_MAX_DIMENSION = 16383;

export type FittedSize = {
  width: number;
  height: number;
  /** 1 when the image already fits; < 1 when it had to be shrunk. */
  scale: number;
};

/**
 * Shrinks a pixel size just enough to fit inside WebP's dimension limit,
 * preserving aspect ratio. Both dimensions are floored so the result can
 * never round back above the limit.
 *
 * The returned `scale` describes the encoded image only — it deliberately does
 * NOT apply to the capture's reported width/height, which stay in CSS pixels
 * (see runCapture). Element-map rects are in that same CSS-pixel space and the
 * viewer draws the image into a box of exactly those dimensions, so a downscale
 * here never moves a coordinate.
 */
export function fitWithinWebpLimits(size: { width: number; height: number }): FittedSize {
  const longest = Math.max(size.width, size.height);
  if (longest <= WEBP_MAX_DIMENSION) {
    return { width: size.width, height: size.height, scale: 1 };
  }

  const scale = WEBP_MAX_DIMENSION / longest;
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
    scale,
  };
}
