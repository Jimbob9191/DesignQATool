import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(60)
    .regex(slugPattern, "Lowercase letters, numbers, and hyphens only"),
  baseUrl: z.string().trim().url("Enter a valid URL").or(z.literal("")),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
