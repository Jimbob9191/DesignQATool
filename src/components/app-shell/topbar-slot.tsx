"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";

// The top bar lives in the app layout, so a page can't pass it props. Instead
// the bar renders slots, and a page portals its own content into them:
// breadcrumbs at the start, and page actions at the end, before search.
type SlotName = "start" | "end";

const TopbarSlotContext = createContext<{
  slots: Partial<Record<SlotName, HTMLElement | null>>;
  setSlot: (name: SlotName, slot: HTMLElement | null) => void;
} | null>(null);

export function TopbarSlotProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<Partial<Record<SlotName, HTMLElement | null>>>({});
  const setSlot = useCallback((name: SlotName, slot: HTMLElement | null) => {
    setSlots((prev) => (prev[name] === slot ? prev : { ...prev, [name]: slot }));
  }, []);
  return <TopbarSlotContext.Provider value={{ slots, setSlot }}>{children}</TopbarSlotContext.Provider>;
}

/** Where page content appears in the top bar. */
export function TopbarSlot({ name, className }: { name: SlotName; className?: string }) {
  const setSlot = useContext(TopbarSlotContext)?.setSlot;
  const ref = useCallback((el: HTMLElement | null) => setSlot?.(name, el), [setSlot, name]);
  return <div ref={ref} className={className} />;
}

/** Renders its children in the top bar instead of in place. */
export function TopbarPortal({ slot = "start", children }: { slot?: SlotName; children: React.ReactNode }) {
  const target = useContext(TopbarSlotContext)?.slots[slot];
  return target ? createPortal(children, target) : null;
}
