import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError } from "@/lib/http";
import { maxUploadBytes } from "@/lib/env";
import { LANGUAGE_CODES } from "@/lib/languages";
import { storage, newStorageKey } from "@/lib/storage";
import { ACCEPTED_EXTENSIONS, ACCEPTED_TYPES, InvalidFileError, detectFileKind, screenUnsafeContent } from "@/lib/ingestion/file-types";
import { enqueueProcessing } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/documents - all documents with version and processing status. */
export const GET = adminRoute("VIEWER", async () => {
  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { category: { select: { id: true, name: true, slug: true } }, _count: { select: { chunks: true } } },
  });
  return NextResponse.json({
    documents: documents.map(({ _count, ...d }) => ({ ...d, chunkCount: _count.chunks })),
    accepted: ACCEPTED_EXTENSIONS,
    maxUploadBytes: maxUploadBytes(),
  });
});

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date");

const metaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  categoryId: z.string().min(1).max(40),
  language: z.enum(LANGUAGE_CODES),
  sourceUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\//.test(v), "Source URL must start with https://"),
  effectiveAt: optionalDate,
  lastReviewedAt: optionalDate,
  publicViewEnabled: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  replacesDocumentId: z.string().max(40).optional(),
});

/** POST /api/admin/documents - multipart upload of a new document or a new version. */
export const POST = adminRoute("EDITOR", async (req, user) => {
  const limit = maxUploadBytes();
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > limit + 64 * 1024) throw new ApiError("payload_too_large", `File exceeds the ${Math.round(limit / 1048576)} MB limit`);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("bad_request", "A file is required");
  if (file.size > limit) throw new ApiError("payload_too_large", `File exceeds the ${Math.round(limit / 1048576)} MB limit`);

  const meta = metaSchema.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const category = await prisma.knowledgeCategory.findUnique({ where: { id: meta.categoryId } });
  if (!category) throw new ApiError("validation_error", "Unknown category");

  const data = Buffer.from(await file.arrayBuffer());
  let kind;
  try {
    kind = detectFileKind(file.name, data);
  } catch (error) {
    if (error instanceof InvalidFileError) {
      throw new ApiError("validation_error", `${error.message}. Supported formats: ${ACCEPTED_EXTENSIONS.join(", ")}, max ${Math.round(limit / 1048576)} MB.`);
    }
    throw error;
  }
  const unsafe = screenUnsafeContent(kind, data);
  if (unsafe) throw new ApiError("validation_error", `File rejected: ${unsafe}`);

  let groupId: string = randomUUID();
  let version = 1;
  if (meta.replacesDocumentId) {
    const previous = await prisma.knowledgeDocument.findUnique({ where: { id: meta.replacesDocumentId } });
    if (!previous) throw new ApiError("not_found", "Document to replace not found");
    groupId = previous.groupId;
    const latest = await prisma.knowledgeDocument.aggregate({ where: { groupId }, _max: { version: true } });
    version = (latest._max.version ?? previous.version) + 1;
  }

  const storageKey = newStorageKey(file.name);
  await storage().put(storageKey, data, ACCEPTED_TYPES[kind].mime);
  const doc = await prisma.knowledgeDocument.create({
    data: {
      groupId,
      version,
      title: meta.title,
      description: meta.description,
      categoryId: meta.categoryId,
      language: meta.language,
      sourceUrl: meta.sourceUrl,
      effectiveAt: meta.effectiveAt,
      lastReviewedAt: meta.lastReviewedAt,
      publicViewEnabled: meta.publicViewEnabled,
      storageKey,
      fileName: file.name.slice(0, 200),
      mimeType: ACCEPTED_TYPES[kind].mime,
      fileSize: data.byteLength,
      checksum: createHash("sha256").update(data).digest("hex"),
      createdById: user.id,
    },
  });
  await audit(user.id, meta.replacesDocumentId ? "document_version_uploaded" : "document_uploaded", "KnowledgeDocument", doc.id, {
    version,
    fileName: doc.fileName,
  });
  enqueueProcessing(doc.id);
  return NextResponse.json({ document: doc }, { status: 201 });
});
