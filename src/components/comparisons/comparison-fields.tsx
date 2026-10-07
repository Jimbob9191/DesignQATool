"use client";

import { ImageIcon } from "lucide-react";

import { VIEWPORT_PRESETS } from "@/lib/live/viewports";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The form fields the create and edit comparison dialogs share.

export type DesignOption = {
  id: string;
  label: string;
  thumbnailUrl: string | null;
  width: number | null;
  /** Where a design from elsewhere in the team comes from, e.g. "from Home". */
  note: string | null;
};

export function DesignSelect({
  options,
  value,
  onChange,
}: {
  options: DesignOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a design upload" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
              {option.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs
                <img src={option.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-3.5 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 truncate">
              {option.label}
              {option.width ? <span className="text-muted-foreground"> — {option.width}px</span> : null}
              {option.note ? <span className="text-muted-foreground"> ({option.note})</span> : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ViewportSelect({ value, onChange }: { value: number; onChange: (width: number) => void }) {
  // The dialogs only offer presets, but the column takes any width in range,
  // so keep a non-preset value selectable rather than showing a blank select.
  const isPreset = VIEWPORT_PRESETS.some((preset) => preset.width === value);

  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {isPreset ? null : <SelectItem value={String(value)}>{value}px</SelectItem>}
        {VIEWPORT_PRESETS.map((preset) => (
          <SelectItem key={preset.width} value={String(preset.width)}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
