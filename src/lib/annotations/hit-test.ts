export type ElementMapEntry = {
  selector: string;
  tag: string;
  role: string | null;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
};

/**
 * Finds the smallest-area element in the map whose rect contains the given
 * image-space point. Linear scan — element maps are capped at ~4000
 * entries, cheap enough for an interactive click/hover.
 */
export function hitTestElementMap(
  elementMap: ElementMapEntry[],
  point: { x: number; y: number }
): ElementMapEntry | null {
  let best: ElementMapEntry | null = null;
  let bestArea = Infinity;

  for (const entry of elementMap) {
    const { rect } = entry;
    const contains =
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height;
    if (!contains) continue;

    const area = rect.width * rect.height;
    if (area < bestArea) {
      best = entry;
      bestArea = area;
    }
  }

  return best;
}
