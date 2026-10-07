// Static, inline-styled pins for the print page: Playwright prints it, so
// there's nothing to click or drag, and the app's Tailwind status classes are
// spelled out as the same colours from globals.css.

type PinStatus = "open" | "resolved" | "wont_fix" | "needs_review";

const STATUS_STYLES: Record<PinStatus, { background: string; color: string; opacity?: number }> = {
  open: { background: "oklch(0.588 0.158 241.966)", color: "oklch(0.985 0 0)" },
  resolved: { background: "oklch(0.648 0.15 160)", color: "oklch(0.985 0 0)", opacity: 0.7 },
  wont_fix: { background: "oklch(0.556 0 0)", color: "oklch(0.985 0 0)", opacity: 0.7 },
  needs_review: { background: "oklch(0.705 0.191 60)", color: "oklch(0.145 0 0)" },
};

export type PrintPin = { number: number; status: PinStatus; xRatio: number; yPx: number };

/**
 * The image with its numbered pins on top. Pins are stored as a fraction of
 * the image's width and a y in image pixels (as the viewers draw them), so
 * both become percentages of the image's natural size and stay put however
 * wide the column prints.
 */
export function PinnedImage({
  src,
  alt,
  height,
  pins,
}: {
  src: string;
  alt: string;
  /** Natural height in image pixels; without it pins can't be placed. */
  height: number | null;
  pins: PrintPin[];
}) {
  return (
    <div style={{ position: "relative", border: "1px solid #ddd", lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL fetched by Playwright, not the app UI */}
      <img src={src} alt={alt} style={{ display: "block", width: "100%", height: "auto" }} />
      {height
        ? pins.map((pin) => {
            const style = STATUS_STYLES[pin.status];
            return (
              <span
                key={pin.number}
                style={{
                  position: "absolute",
                  left: `${Math.min(1, Math.max(0, pin.xRatio)) * 100}%`,
                  top: `${Math.min(1, Math.max(0, pin.yPx / height)) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "2px solid #fff",
                  // Not a box-shadow: Chromium rasterises those into the PDF
                  // as a grey box around the pin.
                  outline: "1px solid #555",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: "bold",
                  lineHeight: 1,
                  ...style,
                }}
              >
                {pin.number}
              </span>
            );
          })
        : null}
    </div>
  );
}
