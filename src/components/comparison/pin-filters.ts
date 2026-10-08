import type { AnnotationStatus } from "@/components/comparison/pin-marker";

/** Narrows the pins shown on the canvas and in the comment panel. */
export type PinFilters = {
  status: AnnotationStatus | "all";
  target: "design" | "live" | "all";
  /** An author's email, or "all". */
  author: string;
};

export const NO_PIN_FILTERS: PinFilters = { status: "all", target: "all", author: "all" };

export function activePinFilterCount(filters: PinFilters): number {
  return Object.values(filters).filter((value) => value !== "all").length;
}

export function matchesPinFilters(
  pin: { status: AnnotationStatus; target: "design" | "live"; authorEmail: string },
  filters: PinFilters
): boolean {
  return (
    (filters.status === "all" || pin.status === filters.status) &&
    (filters.target === "all" || pin.target === filters.target) &&
    (filters.author === "all" || pin.authorEmail === filters.author)
  );
}
