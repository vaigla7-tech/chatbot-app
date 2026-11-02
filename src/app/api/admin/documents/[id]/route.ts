import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { LANGUAGE_CODES } from "@/lib/languages";
import { storage } from "@/lib/storage";
import { invalidateRetrievalCache } from "@/lib/retrieval";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    categoryId: z.string().min(1).max(40),
    language: z.enum(LANGUAGE_CODES),
    sourceUrl: z.string().trim().regex(/^https:\/\//, "Source URL must start with https://").max(500).nullable(),
    effectiveAt: z.string().datetime({ offset: true }).or(z.string().date()).nullable(),
    lastReviewedAt: z.string().datetime({ offset: true }).or(z.string().date()).nullable(),
    publicViewEnabled: z.boolean(),
    publicationStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  })
  .partial()
  .strict();

export const GET = adminRoute<{ id: string }>("VIEWER", async (_req, _user, { id }) => {
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      category: true,
      chunks: { orderBy: { chunkIndex: "asc" }, take: 50, select: { chunkIndex: true, heading: true, pageNumber: true, content: true } },
    },
  });
  if (!doc) throw new ApiError("not_found", "Document not found");
  const versions = await prisma.knowledgeDocument.findMany({
    where: { groupId: doc.groupId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, title: true, fileName: true, publicationStatus: true, processingStatus: true, createdAt: true },
  });
  return NextResponse.json({ document: doc, versions });
});

/** PATCH /api/admin/documents/:id - edit metadata, publish (approve) or archive. */
export const PATCH = adminRoute<{ id: string }>("EDITOR", async (req, user, { id }) => {
  const body = await readJson(req, patchSchema);
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc) throw new ApiError("not_found", "Document not found");
  if (body.publicationStatus === "PUBLISHED" && doc.processingStatus !== "READY") {
    throw new ApiError("conflict", "Only successfully processed documents can be published");
  }
  const { effectiveAt, lastReviewedAt, ...rest } = body;
  const updated = await prisma.$transaction(async (tx) => {
    if (body.publicationStatus === "PUBLISHED") {
      // Publishing a version archives every other version of the same document.
      await tx.knowledgeDocument.updateMany({
        where: { groupId: doc.groupId, id: { not: id }, publicationStatus: "PUBLISHED" },
        data: { publicationStatus: "ARCHIVED" },
      });
    }
    return tx.knowledgeDocument.update({
      where: { id },
      data: {
        ...rest,
        ...(effectiveAt !== undefined ? { effectiveAt: effectiveAt ? new Date(effectiveAt) : null } : {}),
        ...(lastReviewedAt !== undefined ? { lastReviewedAt: lastReviewedAt ? new Date(lastReviewedAt) : null } : {}),
        ...(body.publicationStatus === "PUBLISHED" && lastReviewedAt === undefined ? { lastReviewedAt: new Date() } : {}),
      },
    });
  });
  invalidateRetrievalCache();
  await audit(user.id, body.publicationStatus ? `document_${body.publicationStatus.toLowerCase()}` : "document_updated", "KnowledgeDocument", id, {
    fields: Object.keys(body),
  });
  return NextResponse.json({ document: updated });
});

/** DELETE /api/admin/documents/:id - permanently remove incorrect information. */
export const DELETE = adminRoute<{ id: string }>("ADMIN", async (_req, user, { id }) => {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc) throw new ApiError("not_found", "Document not found");
  await prisma.knowledgeDocument.delete({ where: { id } });
  if (doc.storageKey) await storage().delete(doc.storageKey).catch(() => undefined);
  invalidateRetrievalCache();
  await audit(user.id, "document_deleted", "KnowledgeDocument", id, { title: doc.title, version: doc.version });
  return NextResponse.json({ ok: true });
});
