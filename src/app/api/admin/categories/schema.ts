import { z } from "zod";

export const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Use lowercase letters, numbers and hyphens"),
    description: z.string().trim().max(500).nullable().default(null),
    sortOrder: z.number().int().min(0).max(1000).default(100),
  })
  .strict();
