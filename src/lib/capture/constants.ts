export const PRESET_VIEWPORTS = [390, 768, 1440] as const;
export type PresetViewport = (typeof PRESET_VIEWPORTS)[number];

export type ElementMapEntry = {
  selector: string;
  tag: string;
  role: string | null;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
};
