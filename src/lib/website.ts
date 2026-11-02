import { createHash } from "node:crypto";
import { load } from "cheerio";
import { prisma } from "./db";
import { websiteAllowedHosts } from "./env";
import { safeFetch } from "./ssrf";
import { normalizeText } from "./ingestion/extract";
import { storage, newStorageKey } from "./storage";
import { enqueueProcessing } from "./ingestion/pipeline";

/** Extract readable main content from an HTML page, dropping navigation and scripts. */
export function extractReadableText(html: string): { title: string | null; text: string } {
  const $ = load(html);
  $("script, style, noscript, iframe, svg, form, nav, header, footer, aside, [aria-hidden=true], .cookie, #cookie-banner").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || null;
  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const lines: string[] = [];
  root.find("h1, h2, h3, h4, p, li, dt, dd, td").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (/^h[1-4]$/.test(tag)) lines.push(`\n${"#".repeat(Number(tag[1]))} ${text}`);
    else if (tag === "li") lines.push(`- ${text}`);
    else lines.push(text);
  });
  return { title, text: normalizeText(lines.join("\n")) };
}

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Fetch an approved-host page and stage its text for administrator review.
 * Nothing becomes searchable until the administrator approves it.
 */
export async function fetchWebsiteSource(sourceId: string): Promise<{ changed: boolean }> {
  const source = await prisma.websiteSource.findUniqueOrThrow({ where: { id: sourceId } });
  try {
    const page = await safeFetch(source.url, websiteAllowedHosts());
    const { title, text } = page.contentType.includes("html")
      ? extractReadableText(page.body)
      : { title: null, text: normalizeText(page.body) };
    if (text.length < 50) throw new Error("Page contains too little readable text");
    const hash = contentHash(text);
    const changed = hash !== source.contentHash;
    await prisma.websiteSource.update({
      where: { id: sourceId },
      data: {
        title: source.title ?? title?.slice(0, 200) ?? null,
        lastFetchedAt: new Date(),
        lastCheckedAt: new Date(),
        lastError: null,
        ...(changed ? { pendingContent: text.slice(0, 500_000), pendingContentHash: hash } : { pendingContent: null, pendingContentHash: null }),
      },
    });
    return { changed };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Fetch failed").slice(0, 300);
    await prisma.websiteSource.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date(), lastError: message } });
    throw error;
  }
}

/** Approve the staged content: store it as a knowledge document version and process it. */
export async function approveWebsiteContent(sourceId: string, adminId: string): Promise<string> {
  const source = await prisma.websiteSource.findUniqueOrThrow({ where: { id: sourceId }, include: { document: true } });
  const pendingContent = source.pendingContent;
  const pendingHash = source.pendingContentHash;
  if (!pendingContent || !pendingHash) throw new Error("No fetched content is waiting for approval");
  const key = newStorageKey(`${new URL(source.url).hostname}.md`);
  await storage().put(key, Buffer.from(pendingContent, "utf8"), "text/markdown");

  const previous = source.document;
  const doc = await prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.knowledgeDocument.update({ where: { id: previous.id }, data: { publicationStatus: "ARCHIVED" } });
    }
    const created = await tx.knowledgeDocument.create({
      data: {
        groupId: previous?.groupId ?? `web-${source.id}`,
        version: (previous?.version ?? 0) + 1,
        title: source.title ?? source.url,
        description: `Imported from ${source.url}`,
        categoryId: source.categoryId,
        language: source.language,
        sourceType: "WEBSITE",
        storageKey: key,
        fileName: "page.md",
        mimeType: "text/markdown",
        fileSize: Buffer.byteLength(pendingContent),
        checksum: pendingHash,
        sourceUrl: source.url,
        publicationStatus: "PUBLISHED",
        lastReviewedAt: new Date(),
        createdById: adminId,
      },
    });
    await tx.websiteSource.update({
      where: { id: sourceId },
      data: {
        approvalStatus: "APPROVED",
        contentHash: pendingHash,
        pendingContent: null,
        pendingContentHash: null,
        documentId: created.id,
      },
    });
    return created;
  });
  enqueueProcessing(doc.id);
  return doc.id;
}
