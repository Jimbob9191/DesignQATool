import { z } from "zod";

export const ALLOWED_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024; // matches the bucket's file_size_limit

// pageId/projectId are validated for shape only. Whether the pair agrees is
// decided by resolveAssetScope() in @/lib/assets/scope, which needs the page's
// real project to say anything useful — keeping it out of a .refine() is what
// makes that rule unit-testable without a database.
export const requestUploadUrlSchema = z.object({
  pageId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  filename: z.string().trim().min(1).max(255),
  mime: z.enum(ALLOWED_ASSET_MIME_TYPES),
  size: z.number().int().positive().max(MAX_ASSET_SIZE_BYTES),
});

export const confirmUploadSchema = z.object({
  assetId: z.uuid(),
  storagePath: z.string().min(1),
  pageId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  mime: z.enum(ALLOWED_ASSET_MIME_TYPES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
