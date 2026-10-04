export const VIEWPORT_PRESETS = [
  { width: 375, label: "375px — Mobile" },
  { width: 390, label: "390px — Mobile" },
  { width: 768, label: "768px — Tablet" },
  { width: 1024, label: "1024px — Small laptop" },
  { width: 1280, label: "1280px — Laptop" },
  { width: 1440, label: "1440px — Desktop" },
  { width: 1920, label: "1920px — Large desktop" },
] as const;

export const MIN_VIEWPORT_WIDTH = 320;
export const MAX_VIEWPORT_WIDTH = 2560;

/**
 * Design exports are often @2x or @3x, so a 2880px-wide frame is most likely
 * a 1440px layout. Picks the preset closest to the design at 1x, 2x or 3x.
 */
export function guessViewportWidth(designWidth: number | null): number {
  if (!designWidth) return 1440;
  let best: number = 1440;
  let bestError = Infinity;
  for (const density of [1, 2, 3]) {
    const cssWidth = designWidth / density;
    for (const preset of VIEWPORT_PRESETS) {
      const error = Math.abs(preset.width - cssWidth) / cssWidth;
      if (error < bestError) {
        best = preset.width;
        bestError = error;
      }
    }
  }
  return best;
}
