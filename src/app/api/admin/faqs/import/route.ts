import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { LANGUAGE_CODES } from "@/lib/languages";
import { embedFaq } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/faqs/import - structured JSON FAQ import. Every imported entry
 * is created as DRAFT and must be reviewed and published by an administrator.
 * Format: { "faqs": [{ "question", "answer", "language", "category" (slug), "sourceUrl"?, "group"? }] }
 */
const schema = z
  .object({
    faqs: z
      .array(
        z.object({
          question: z.string().trim().min(3).max(500),
          answer: z.string().trim().min(1).max(5000),
          language: z.enum(LANGUAGE_CODES),
          category: z.string().regex(/^[a-z0-9-]{1,60}$/),
          sourceUrl: z.string().regex(/^https:\/\//).max(500).optional(),
          group: z.string().max(80).optional(),
        }),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const POST = adminRoute("EDITOR", async (req, user) => {
  const { faqs } = await readJson(req, schema, 2 * 1024 * 1024);
  const categories = new Map((await prisma.knowledgeCategory.findMany()).map((c) => [c.slug, c.id]));
  const unknown = [...new Set(faqs.map((f) => f.category).filter((s) => !categories.has(s)))];
  if (unknown.length) throw new ApiError("validation_error", `Unknown category slugs: ${unknown.join(", ")}`);
  const created: string[] = [];
  for (const f of faqs) {
    const faq = await prisma.fAQ.create({
      data: {
        translationGroupId: f.group ?? randomUUID(),
        question: f.question,
        answer: f.answer,
        language: f.language,
        categoryId: categories.get(f.category)!,
        sourceUrl: f.sourceUrl ?? null,
        approvalStatus: "DRAFT",
      },
    });
    created.push(faq.id);
  }
  for (const id of created) await embedFaq(id);
  await audit(user.id, "faq_imported", "FAQ", null, { count: created.length });
  return NextResponse.json({ imported: created.length });
});
