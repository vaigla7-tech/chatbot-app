import { prisma } from "../db";
import { storage } from "../storage";
import { embedTexts, embeddingsEnabled } from "../embeddings";
import { recordOperationalError } from "../analytics";
import { invalidateRetrievalCache } from "../retrieval";
import { chunkSections } from "./chunk";
import { extractText } from "./extract";
import { detectFileKind, screenUnsafeContent, type FileKind } from "./file-types";

/**
 * Document processing pipeline: load → validate → screen → extract → normalise →
 * chunk → embed → store. A document becomes searchable only when processing is
 * READY *and* an administrator has published it.
 *
 * Jobs run in-process on a small queue so uploads return immediately. If the
 * service restarts mid-job the document stays PROCESSING and can be reprocessed
 * from the admin UI (see docs/ARCHITECTURE.md for moving this to a worker service).
 */

const queue: string[] = [];
let running = false;

export function enqueueProcessing(documentId: string): void {
  if (!queue.includes(documentId)) queue.push(documentId);
  if (!running) void drain();
}

async function drain() {
  running = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift()!;
      await processDocument(id);
    }
  } finally {
    running = false;
  }
}

export async function processDocument(documentId: string): Promise<void> {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { processingStatus: "PROCESSING", processingError: null },
  });

  try {
    if (!doc.storageKey || !doc.fileName) throw new Error("Document has no stored file");
    const file = await storage().get(doc.storageKey);
    if (!file) throw new Error("Stored file not found");

    const kind: FileKind = detectFileKind(doc.fileName, file.data);
    const unsafe = screenUnsafeContent(kind, file.data);
    if (unsafe) throw new Error(`Rejected by content screening: ${unsafe}`);

    const sections = await extractText(kind, file.data);
    const chunks = chunkSections(sections);
    if (chunks.length === 0) throw new Error("No readable text could be extracted (scanned PDFs need OCR before upload)");
    if (chunks.length > 5000) throw new Error("Document is too large (more than 5000 chunks)");

    let vectors: number[][] | null = null;
    let model: string | null = null;
    if (embeddingsEnabled()) {
      const embedded = await embedTexts(chunks.map((c) => c.content));
      vectors = embedded?.vectors ?? null;
      model = embedded?.model ?? null;
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId } });
        await tx.documentChunk.createMany({
          data: chunks.map((c, i) => ({
            documentId,
            chunkIndex: i,
            content: c.content,
            heading: c.heading,
            pageNumber: c.pageNumber,
            embedding: vectors?.[i] ?? [],
            embeddingModel: vectors ? model : null,
          })),
        });
        await tx.knowledgeDocument.update({
          where: { id: documentId },
          data: { processingStatus: "READY", processingError: null },
        });
      },
      { timeout: 60_000 },
    );
    invalidateRetrievalCache();
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Processing failed").slice(0, 500);
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { processingStatus: "FAILED", processingError: message },
    });
    await recordOperationalError({ source: "ingestion", code: "processing_failed", message: `Document ${documentId}: ${message}` });
  }
}

/** (Re)compute embeddings for FAQ entries. Safe to call when embeddings are disabled. */
export async function embedFaq(faqId: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  const faq = await prisma.fAQ.findUnique({ where: { id: faqId } });
  if (!faq) return;
  try {
    const embedded = await embedTexts([`${faq.question}\n${faq.answer}`]);
    if (embedded?.vectors[0]) {
      await prisma.fAQ.update({ where: { id: faqId }, data: { embedding: embedded.vectors[0], embeddingModel: embedded.model } });
    }
  } catch {
    await recordOperationalError({ source: "embeddings", provider: "openai", code: "faq_embedding_failed", message: `FAQ ${faqId}` });
  }
}
