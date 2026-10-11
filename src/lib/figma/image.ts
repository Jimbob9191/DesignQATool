// Pure helpers for Figma renders, kept apart from the API client so they can
// be unit-tested.

/** Figma downscales any render over this many pixels, whatever scale we ask for. */
export const FIGMA_MAX_RENDER_PIXELS = 32_000_000;

/**
 * The largest of 2x and 1x that Figma will render at full size. 2x is what
 * people usually export and what guessViewportWidth() expects, but a long
 * page at 2x goes over Figma's pixel cap and comes back at some odd scale in
 * between, which would throw off scroll sync with the live site. Null when
 * even 1x is over the cap.
 */
export function pickRenderScale(frame: { width: number; height: number }): 2 | 1 | null {
  for (const scale of [2, 1] as const) {
    const pixels = Math.ceil(frame.width * scale) * Math.ceil(frame.height * scale);
    if (pixels <= FIGMA_MAX_RENDER_PIXELS) return scale;
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width and height from a PNG's IHDR chunk, which always comes first. We
 * record the image's real size rather than trusting the frame's, since that's
 * what the viewer lays out with. Null if it isn't a PNG.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 8-byte signature, 4-byte chunk length, then the "IHDR" chunk type.
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
