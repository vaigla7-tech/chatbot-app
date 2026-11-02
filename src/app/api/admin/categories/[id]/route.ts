import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";
import { categorySchema } from "../schema";

export const PATCH = adminRoute<{ id: string }>("ADMIN", async (req, user, { id }) => {
  const body = await readJson(req, categorySchema.partial().strict());
  const category = await prisma.knowledgeCategory.update({ where: { id }, data: body });
  await audit(user.id, "category_updated", "KnowledgeCategory", id);
  return NextResponse.json({ category });
});

/** Categories still referenced by documents or FAQs cannot be deleted (restricted delete). */
export const DELETE = adminRoute<{ id: string }>("ADMIN", async (_req, user, { id }) => {
  await prisma.knowledgeCategory.delete({ where: { id } });
  await audit(user.id, "category_deleted", "KnowledgeCategory", id);
  return NextResponse.json({ ok: true });
});
