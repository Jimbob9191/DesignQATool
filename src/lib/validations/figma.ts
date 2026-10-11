import { z } from "zod";

export const connectFigmaSchema = z.object({
  token: z.string().trim().min(10, "Paste your Figma personal access token").max(512),
});

export const importFigmaFrameSchema = z.object({
  url: z.string().trim().min(1, "Paste a link to a Figma frame").max(2048),
  pageId: z.uuid().nullable(),
});
