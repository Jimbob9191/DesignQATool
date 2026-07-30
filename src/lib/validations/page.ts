import { z } from "zod";

export const pageFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  path: z
    .string()
    .trim()
    .min(1, "Path is required")
    .max(300)
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  description: z.string().trim().max(500).or(z.literal("")),
});

export type PageFormValues = z.infer<typeof pageFormSchema>;
