"use client";

import { PinMarker, type AnnotationStatus } from "@/components/comparison/pin-marker";

export type ImagePin = {
  id: string;
  number: number;
  status: AnnotationStatus;
  /** Position in the image's own pixels. */
  x: number;
  y: number;
};

export function pinElementId(id: string): string {
  return `pin-${id}`;
}

/**
 * A plain, full-width image with read-only pins over it. Pins sit at
 * percentages of the image's natural size, so they stay on their spot at
 * whatever width the image is rendered.
 */
export function PinnedImage({
  src,
  alt,
  width,
  height,
  pins,
  selectedId,
  onSelect,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  pins: ImagePin[];
  selectedId?: string | null;
  /** Omit for a static image, e.g. in print. */
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL */}
      <img src={src} alt={alt} className="w-full rounded-md border border-border" />
      <div className="pointer-events-none absolute inset-0">
        {pins.map((pin) => (
          <div
            key={pin.id}
            id={pinElementId(pin.id)}
            className="absolute"
            style={{ left: `${(pin.x / width) * 100}%`, top: `${(pin.y / height) * 100}%` }}
          >
            <PinMarker
              number={pin.number}
              status={pin.status}
              screenX={0}
              screenY={0}
              scale={1}
              selected={pin.id === selectedId}
              onSelect={() => onSelect?.(pin.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
