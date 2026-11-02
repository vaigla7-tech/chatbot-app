import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { embedFaq } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/audit";
import { faqInputSchema } from "./schema";

export const dynamic = "force-dynamic";

export const GET = adminRoute("VIEWER", async (req) => {
  const params = new URL(req.url).searchParams;
  const faqs = await prisma.fAQ.findMany({
    where: {
      ...(params.get("language") ? { language: params.get("language")! } : {}),
      ...(params.get("status") ? { approvalStatus: params.get("status") as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      translationGroupId: true,
      question: true,
      answer: true,
      language: true,
      sourceUrl: true,
      approvalStatus: true,
      isExample: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ faqs });
});

export const POST = adminRoute("EDITOR", async (req, user) => {
  const body = await readJson(req, faqInputSchema);
  if (!(await prisma.knowledgeCategory.findUnique({ where: { id: body.categoryId } })))
    throw new ApiError("validation_error", "Unknown category");
  const faq = await prisma.fAQ.create({
    data: { ...body, translationGroupId: body.translationGroupId ?? randomUUID() },
  });
  await embedFaq(faq.id);
  await audit(user.id, "faq_created", "FAQ", faq.id, { status: faq.approvalStatus, language: faq.language });
  return NextResponse.json({ faq }, { status: 201 });
});
