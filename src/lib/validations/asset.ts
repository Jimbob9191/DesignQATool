import { z } from "zod";

export const ALLOWED_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024; // matches the bucket's file_size_limit

export const requestUploadUrlSchema = z.object({
  pageId: z.uuid().nullable(),
  filename: z.string().trim().min(1).max(255),
  mime: z.enum(ALLOWED_ASSET_MIME_TYPES),
  size: z.number().int().positive().max(MAX_ASSET_SIZE_BYTES),
});

export const confirmUploadSchema = z.object({
  assetId: z.uuid(),
  storagePath: z.string().min(1),
  pageId: z.uuid().nullable(),
  mime: z.enum(ALLOWED_ASSET_MIME_TYPES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
