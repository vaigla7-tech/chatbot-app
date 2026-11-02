import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";
import { categorySchema } from "./schema";

export const dynamic = "force-dynamic";



export const GET = adminRoute("VIEWER", async () => {
  const categories = await prisma.knowledgeCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true, faqs: true } } },
  });
  return NextResponse.json({ categories });
});

export const POST = adminRoute("ADMIN", async (req, user) => {
  const body = await readJson(req, categorySchema);
  const category = await prisma.knowledgeCategory.create({ data: body });
  await audit(user.id, "category_created", "KnowledgeCategory", category.id, { slug: category.slug });
  return NextResponse.json({ category }, { status: 201 });
});
