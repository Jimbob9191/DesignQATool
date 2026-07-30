"use client";

export function ElementHoverHighlight({
  rect,
  imageToScreen,
  scale,
}: {
  rect: { x: number; y: number; width: number; height: number };
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  scale: number;
}) {
  const topLeft = imageToScreen(rect.x, rect.y);

  return (
    <div
      className="pointer-events-none absolute border-2 border-status-open bg-status-open/10"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: rect.width * scale,
        height: rect.height * scale,
      }}
    />
  );
}
