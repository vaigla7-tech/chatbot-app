import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";

export const faqInputSchema = z
  .object({
    question: z.string().trim().min(3).max(500),
    answer: z.string().trim().min(1).max(5000),
    categoryId: z.string().min(1).max(40),
    language: z.enum(LANGUAGE_CODES),
    sourceUrl: z.string().trim().regex(/^https:\/\//, "Source URL must start with https://").max(500).nullable().default(null),
    approvalStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    // Link a translation to an existing FAQ group.
    translationGroupId: z.string().max(80).optional(),
  })
  .strict();
