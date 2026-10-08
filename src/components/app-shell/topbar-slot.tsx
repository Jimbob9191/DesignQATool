"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";

// The top bar lives in the app layout, so a page can't pass it props. Instead
// the bar renders a slot, and a page portals its own content (breadcrumbs) into it.
const TopbarSlotContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
} | null>(null);

export function TopbarSlotProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <TopbarSlotContext.Provider value={{ slot, setSlot }}>{children}</TopbarSlotContext.Provider>;
}

/** Where page content appears in the top bar. */
export function TopbarSlot({ className }: { className?: string }) {
  const setSlot = useContext(TopbarSlotContext)?.setSlot;
  return <div ref={setSlot} className={className} />;
}

/** Renders its children in the top bar instead of in place. */
export function TopbarPortal({ children }: { children: React.ReactNode }) {
  const slot = useContext(TopbarSlotContext)?.slot;
  return slot ? createPortal(children, slot) : null;
}
