"use client";

import dynamic from "next/dynamic";

// Retune's overlay renders nothing outside development, but importing it
// statically would still ship its ~120 kB to every visitor. NODE_ENV is
// inlined at build time, so production drops the import and its chunk. The
// package itself is imported statically in retune-overlay-impl: it only
// exports an ES module, which a dynamic import of it can't resolve.
const Retune =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/retune-overlay-impl"), { ssr: false })
    : () => null;

/** Visual editing overlay for development; Alt/Option+D toggles it. */
export function RetuneOverlay() {
  return <Retune />;
}
