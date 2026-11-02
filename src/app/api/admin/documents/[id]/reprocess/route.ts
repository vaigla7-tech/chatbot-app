import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError } from "@/lib/http";
import { enqueueProcessing } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/audit";

/** POST /api/admin/documents/:id/reprocess - retry or refresh ingestion. */
export const POST = adminRoute<{ id: string }>("EDITOR", async (_req, user, { id }) => {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc) throw new ApiError("not_found", "Document not found");
  await prisma.knowledgeDocument.update({ where: { id }, data: { processingStatus: "PENDING", processingError: null } });
  enqueueProcessing(id);
  await audit(user.id, "document_reprocess", "KnowledgeDocument", id);
  return NextResponse.json({ ok: true });
});
