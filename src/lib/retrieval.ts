import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { cosineSimilarity, embedTexts, embeddingModel, embeddingsEnabled } from "./embeddings";

/**
 * Hybrid retrieval over approved knowledge: PostgreSQL full-text search plus
 * embedding similarity, fused with reciprocal-rank fusion. Only PUBLISHED and
 * fully processed sources are ever returned.
 */

export interface KnowledgeHit {
  key: string; // unique per chunk / FAQ
  kind: "document" | "faq";
  sourceId: string; // KnowledgeDocument.id or FAQ.id
  groupId: string; // document version group or FAQ translation group
  title: string;
  content: string;
  heading: string | null;
  pageNumber: number | null;
  categorySlug: string;
  language: string;
  url: string | null;
  effectiveAt: Date | null;
  updatedAt: Date;
  publicationStatus: string;
  processingStatus: string;
  termCoverage: number;
  similarity: number | null;
  ftsRank: number | null;
}

export interface RetrievalResult {
  hits: KnowledgeHit[];
  sufficient: boolean;
  embeddingTokens: number;
}

const STOPWORDS = new Set(
  (
    "the and for are with what how can does is it to of in on a an do i my me you your about from this that " +
    "kuidas mis kas ja on see ma mu kui ning " +
    "que como qué cómo el la los las de del en un una es mi por para con " +
    "che come cosa il lo la gli le di del un una è mio per con " +
    "que comment quoi le la les de des du un une est mon pour avec " +
    "wie was ist der die das und ein eine mein für mit ich " +
    "jak co czy jest i w na do z się mój dla"
  ).split(/\s+/),
);

export function queryTerms(query: string): string[] {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(tokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t)))].slice(0, 16);
}

export function termCoverage(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  // Prefix match (first 5 chars) tolerates inflection in ET/PL/DE etc.
  const matched = terms.filter((t) => haystack.includes(t.length > 6 ? t.slice(0, Math.max(5, t.length - 3)) : t));
  return matched.length / terms.length;
}

export function publicSourceUrl(doc: { id: string; sourceUrl: string | null; publicViewEnabled: boolean }): string | null {
  if (doc.sourceUrl) return doc.sourceUrl;
  if (doc.publicViewEnabled) return `/api/sources/${doc.id}`;
  return null;
}

/** Defense in depth: never let unpublished, archived or unprocessed material through. */
export function isLiveSource(hit: Pick<KnowledgeHit, "kind" | "publicationStatus" | "processingStatus">): boolean {
  if (hit.publicationStatus !== "PUBLISHED") return false;
  return hit.kind === "faq" || hit.processingStatus === "READY";
}

/**
 * Pure ranking step (unit tested): filters, de-duplicates, keeps only the newest
 * version per document group, fuses rankings and applies the relevance gate.
 */
export function rankHits(
  candidates: KnowledgeHit[],
  opts: { language: string; minRelevance: number; limit: number; maxPerSource?: number },
): { hits: KnowledgeHit[]; sufficient: boolean } {
  const live = candidates.filter(isLiveSource);

  // Keep only the newest source per version group (e.g. superseded documents).
  const newestByGroup = new Map<string, KnowledgeHit>();
  for (const hit of live) {
    if (hit.kind !== "document") continue;
    const current = newestByGroup.get(hit.groupId);
    const time = (hit.effectiveAt ?? hit.updatedAt).getTime();
    if (!current || time > (current.effectiveAt ?? current.updatedAt).getTime()) newestByGroup.set(hit.groupId, hit);
  }
  const current = live.filter((h) => h.kind === "faq" || newestByGroup.get(h.groupId)?.sourceId === h.sourceId);

  const unique = new Map<string, KnowledgeHit>();
  for (const hit of current) {
    const prev = unique.get(hit.key);
    unique.set(hit.key, prev ? { ...prev, similarity: prev.similarity ?? hit.similarity, ftsRank: prev.ftsRank ?? hit.ftsRank } : hit);
  }
  const all = [...unique.values()];

  const relevant = all.filter(
    (h) => (h.similarity !== null && h.similarity >= opts.minRelevance) || h.termCoverage >= 0.5,
  );

  // Reciprocal-rank fusion over the three signals.
  const score = new Map<string, number>();
  const addRanking = (sorted: KnowledgeHit[]) =>
    sorted.forEach((h, i) => score.set(h.key, (score.get(h.key) ?? 0) + 1 / (60 + i)));
  addRanking([...relevant].filter((h) => h.similarity !== null).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)));
  addRanking([...relevant].filter((h) => h.ftsRank !== null).sort((a, b) => (b.ftsRank ?? 0) - (a.ftsRank ?? 0)));
  addRanking([...relevant].sort((a, b) => b.termCoverage - a.termCoverage));
  for (const h of relevant) {
    if (h.language === opts.language) score.set(h.key, (score.get(h.key) ?? 0) + 0.004);
    if (h.kind === "faq") score.set(h.key, (score.get(h.key) ?? 0) + 0.002);
  }

  const sorted = relevant.sort((a, b) => (score.get(b.key) ?? 0) - (score.get(a.key) ?? 0));
  const perSource = new Map<string, number>();
  const hits: KnowledgeHit[] = [];
  for (const h of sorted) {
    const count = perSource.get(h.sourceId) ?? 0;
    if (count >= (opts.maxPerSource ?? 3)) continue;
    perSource.set(h.sourceId, count + 1);
    hits.push(h);
    if (hits.length >= opts.limit) break;
  }
  return { hits, sufficient: hits.length > 0 };
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

interface VectorIndex {
  model: string;
  at: number;
  entries: Array<{ id: string; vector: Float32Array }>;
}
let vectorIndex: VectorIndex | null = null;
const VECTOR_TTL_MS = 60_000;

export function invalidateRetrievalCache() {
  vectorIndex = null;
}

async function loadVectorIndex(): Promise<VectorIndex> {
  const model = embeddingModel();
  if (vectorIndex && vectorIndex.model === model && Date.now() - vectorIndex.at < VECTOR_TTL_MS) return vectorIndex;
  const rows = await prisma.documentChunk.findMany({
    where: {
      embeddingModel: model,
      document: { publicationStatus: "PUBLISHED", processingStatus: "READY" },
    },
    select: { id: true, embedding: true },
  });
  vectorIndex = {
    model,
    at: Date.now(),
    entries: rows.filter((r) => r.embedding.length > 0).map((r) => ({ id: r.id, vector: Float32Array.from(r.embedding) })),
  };
  return vectorIndex;
}

type ChunkRow = {
  id: string;
  content: string;
  heading: string | null;
  pageNumber: number | null;
  documentId: string;
  groupId: string;
  title: string;
  language: string;
  sourceUrl: string | null;
  publicViewEnabled: boolean;
  effectiveAt: Date | null;
  updatedAt: Date;
  publicationStatus: string;
  processingStatus: string;
  categorySlug: string;
};

function chunkToHit(row: ChunkRow, terms: string[], extra: { ftsRank?: number; similarity?: number }): KnowledgeHit {
  return {
    key: `doc:${row.id}`,
    kind: "document",
    sourceId: row.documentId,
    groupId: row.groupId,
    title: row.title,
    content: row.content,
    heading: row.heading,
    pageNumber: row.pageNumber,
    categorySlug: row.categorySlug,
    language: row.language,
    url: publicSourceUrl({ id: row.documentId, sourceUrl: row.sourceUrl, publicViewEnabled: row.publicViewEnabled }),
    effectiveAt: row.effectiveAt,
    updatedAt: row.updatedAt,
    publicationStatus: row.publicationStatus,
    processingStatus: row.processingStatus,
    termCoverage: termCoverage(terms, `${row.title} ${row.heading ?? ""} ${row.content}`),
    similarity: extra.similarity ?? null,
    ftsRank: extra.ftsRank ?? null,
  };
}

const CHUNK_SELECT = Prisma.sql`
  c.id, c.content, c.heading, c."pageNumber", d.id AS "documentId", d."groupId", d.title, d.language,
  d."sourceUrl", d."publicViewEnabled", d."effectiveAt", d."updatedAt",
  d."publicationStatus"::text AS "publicationStatus", d."processingStatus"::text AS "processingStatus",
  cat.slug AS "categorySlug"`;

export async function retrieveKnowledge(
  query: string,
  opts: { language: string; minRelevance: number; limit?: number },
): Promise<RetrievalResult> {
  const terms = queryTerms(query);
  const candidates: KnowledgeHit[] = [];
  let embeddingTokens = 0;

  // 1. Full-text search over published document chunks.
  if (terms.length > 0) {
    const tsQuery = terms.map((t) => `${t}:*`).join(" | ");
    const rows = await prisma.$queryRaw<Array<ChunkRow & { rank: number }>>`
      SELECT ${CHUNK_SELECT}, ts_rank(to_tsvector('simple', c.content), to_tsquery('simple', ${tsQuery})) AS rank
      FROM "DocumentChunk" c
      JOIN "KnowledgeDocument" d ON d.id = c."documentId"
      JOIN "KnowledgeCategory" cat ON cat.id = d."categoryId"
      WHERE d."publicationStatus" = 'PUBLISHED' AND d."processingStatus" = 'READY'
        AND to_tsvector('simple', c.content) @@ to_tsquery('simple', ${tsQuery})
      ORDER BY rank DESC
      LIMIT 30`;
    for (const row of rows) candidates.push(chunkToHit(row, terms, { ftsRank: Number(row.rank) }));
  }

  // 2. Embedding similarity.
  let queryVector: number[] | null = null;
  if (embeddingsEnabled()) {
    try {
      const embedded = await embedTexts([query]);
      queryVector = embedded?.vectors[0] ?? null;
      embeddingTokens = embedded?.tokens ?? 0;
    } catch {
      queryVector = null; // degrade to full-text search only
    }
  }
  if (queryVector) {
    const index = await loadVectorIndex();
    const scored = index.entries
      .map((e) => ({ id: e.id, similarity: cosineSimilarity(queryVector!, e.vector) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);
    if (scored.length > 0) {
      const ids = scored.map((s) => s.id);
      const rows = await prisma.$queryRaw<ChunkRow[]>`
        SELECT ${CHUNK_SELECT}
        FROM "DocumentChunk" c
        JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        JOIN "KnowledgeCategory" cat ON cat.id = d."categoryId"
        WHERE c.id IN (${Prisma.join(ids)})
          AND d."publicationStatus" = 'PUBLISHED' AND d."processingStatus" = 'READY'`;
      const simById = new Map(scored.map((s) => [s.id, s.similarity]));
      for (const row of rows) candidates.push(chunkToHit(row, terms, { similarity: simById.get(row.id) }));
    }
  }

  // 3. Published FAQs (small table - scored in memory).
  const faqs = await prisma.fAQ.findMany({
    where: { approvalStatus: "PUBLISHED" },
    include: { category: { select: { slug: true } } },
  });
  for (const faq of faqs) {
    const sim =
      queryVector && faq.embedding.length === queryVector.length ? cosineSimilarity(queryVector, faq.embedding) : null;
    candidates.push({
      key: `faq:${faq.id}`,
      kind: "faq",
      sourceId: faq.id,
      groupId: faq.translationGroupId,
      title: faq.question,
      content: `Q: ${faq.question}\nA: ${faq.answer}`,
      heading: null,
      pageNumber: null,
      categorySlug: faq.category.slug,
      language: faq.language,
      url: faq.sourceUrl,
      effectiveAt: null,
      updatedAt: faq.updatedAt,
      publicationStatus: faq.approvalStatus,
      processingStatus: "READY",
      termCoverage: termCoverage(terms, `${faq.question} ${faq.answer}`),
      similarity: sim,
      ftsRank: null,
    });
  }

  const { hits, sufficient } = rankHits(candidates, {
    language: opts.language,
    minRelevance: opts.minRelevance,
    limit: opts.limit ?? 6,
  });
  return { hits, sufficient, embeddingTokens };
}

export function appUrl(): string {
  return (env().APP_URL ?? "").replace(/\/$/, "");
}
