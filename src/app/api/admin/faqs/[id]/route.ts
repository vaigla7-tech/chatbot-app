import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { embedFaq } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/audit";
import { faqInputSchema } from "../schema";

export const dynamic = "force-dynamic";

const updateSchema = faqInputSchema.partial().strict();

/** PUT /api/admin/faqs/:id - update content or approval status. */
export const PUT = adminRoute<{ id: string }>("EDITOR", async (req, user, { id }) => {
  const body = await readJson(req, updateSchema);
  const existing = await prisma.fAQ.findUnique({ where: { id } });
  if (!existing) throw new ApiError("not_found", "FAQ not found");
  const faq = await prisma.fAQ.update({ where: { id }, data: { ...body, isExample: body.answer || body.question ? false : existing.isExample } });
  if (body.question || body.answer) await embedFaq(id);
  await audit(user.id, body.approvalStatus ? `faq_${body.approvalStatus.toLowerCase()}` : "faq_updated", "FAQ", id);
  return NextResponse.json({ faq });
});

export const DELETE = adminRoute<{ id: string }>("ADMIN", async (_req, user, { id }) => {
  await prisma.fAQ.delete({ where: { id } });
  await audit(user.id, "faq_deleted", "FAQ", id);
  return NextResponse.json({ ok: true });
});
