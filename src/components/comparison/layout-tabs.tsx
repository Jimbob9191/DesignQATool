"use client";

import { Columns2, Link2, Link2Off, MoveHorizontal, Rows2, SquareStack, SquaresIntersect } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Layout = "side-by-side" | "stacked" | "single" | "overlay" | "swipe";

const LAYOUTS: { value: Layout; label: string; icon: typeof Columns2 }[] = [
  { value: "side-by-side", label: "Side by side", icon: Columns2 },
  { value: "stacked", label: "Stacked", icon: Rows2 },
  { value: "single", label: "Single", icon: SquareStack },
  { value: "overlay", label: "Overlay", icon: SquaresIntersect },
  { value: "swipe", label: "Swipe", icon: MoveHorizontal },
];

/** Icon-only layout switcher; each icon names itself in a tooltip. */
export function LayoutTabs({ value, onValueChange }: { value: Layout; onValueChange: (layout: Layout) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as Layout)}>
      <TabsList>
        {LAYOUTS.map(({ value, label, icon: Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <TabsTrigger value={value} aria-label={label} className="px-2">
                <Icon className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Toggles whether the two panes scroll together. */
export function SyncToggle({ synced, onSyncedChange }: { synced: boolean; onSyncedChange: (synced: boolean) => void }) {
  const label = synced ? "Scrolling together (S)" : "Scrolling separately (S)";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={synced ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          aria-label="Scroll panes together"
          aria-pressed={synced}
          onClick={() => onSyncedChange(!synced)}
        >
          {synced ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
