import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { approveWebsiteContent } from "@/lib/website";
import { invalidateRetrievalCache } from "@/lib/retrieval";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET includes the staged preview text so the administrator can review it before approval. */
export const GET = adminRoute<{ id: string }>("VIEWER", async (_req, _user, { id }) => {
  const source = await prisma.websiteSource.findUnique({ where: { id }, include: { category: true } });
  if (!source) throw new ApiError("not_found", "Source not found");
  return NextResponse.json({ source });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("update"), enabled: z.boolean().optional(), syncEnabled: z.boolean().optional(), title: z.string().trim().max(200).optional() }),
]);

export const PATCH = adminRoute<{ id: string }>("EDITOR", async (req, user, { id }) => {
  const body = await readJson(req, schema);
  if (body.action === "approve") {
    try {
      const documentId = await approveWebsiteContent(id, user.id);
      await audit(user.id, "website_content_approved", "WebsiteSource", id, { documentId });
      return NextResponse.json({ ok: true, documentId });
    } catch (error) {
      throw new ApiError("conflict", error instanceof Error ? error.message : "Approval failed");
    }
  }
  if (body.action === "reject") {
    await prisma.websiteSource.update({
      where: { id },
      data: { pendingContent: null, pendingContentHash: null, ...(await isNew(id)) },
    });
    await audit(user.id, "website_content_rejected", "WebsiteSource", id);
    return NextResponse.json({ ok: true });
  }
  const source = await prisma.websiteSource.update({
    where: { id },
    data: { enabled: body.enabled, syncEnabled: body.syncEnabled, title: body.title },
  });
  // Disabling a source takes its document out of live answers.
  if (body.enabled === false && source.documentId) {
    await prisma.knowledgeDocument.update({ where: { id: source.documentId }, data: { publicationStatus: "ARCHIVED" } });
    invalidateRetrievalCache();
  }
  await audit(user.id, "website_source_updated", "WebsiteSource", id, { enabled: body.enabled, syncEnabled: body.syncEnabled });
  return NextResponse.json({ source });
});

async function isNew(id: string) {
  const s = await prisma.websiteSource.findUnique({ where: { id }, select: { contentHash: true } });
  return s?.contentHash ? {} : { approvalStatus: "REJECTED" as const };
}

export const DELETE = adminRoute<{ id: string }>("ADMIN", async (_req, user, { id }) => {
  const source = await prisma.websiteSource.findUnique({ where: { id } });
  if (!source) throw new ApiError("not_found", "Source not found");
  if (source.documentId) {
    await prisma.knowledgeDocument.update({ where: { id: source.documentId }, data: { publicationStatus: "ARCHIVED" } });
  }
  await prisma.websiteSource.delete({ where: { id } });
  invalidateRetrievalCache();
  await audit(user.id, "website_source_deleted", "WebsiteSource", id, { url: source.url });
  return NextResponse.json({ ok: true });
});
