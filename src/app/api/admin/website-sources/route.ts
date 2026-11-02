import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { websiteAllowedHosts } from "@/lib/env";
import { LANGUAGE_CODES } from "@/lib/languages";
import { UrlNotAllowedError, validateUrlShape } from "@/lib/ssrf";
import { fetchWebsiteSource } from "@/lib/website";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("VIEWER", async () => {
  const sources = await prisma.websiteSource.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      title: true,
      enabled: true,
      approvalStatus: true,
      language: true,
      syncEnabled: true,
      lastFetchedAt: true,
      lastCheckedAt: true,
      lastError: true,
      contentHash: true,
      pendingContentHash: true,
      documentId: true,
      category: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ sources, allowedHosts: websiteAllowedHosts() });
});

const schema = z
  .object({
    url: z.string().trim().max(500),
    categoryId: z.string().min(1).max(40),
    language: z.enum(LANGUAGE_CODES),
    title: z.string().trim().max(200).optional(),
  })
  .strict();

/** POST /api/admin/website-sources - add an allowlisted public URL and fetch a preview. */
export const POST = adminRoute("EDITOR", async (req, user) => {
  const body = await readJson(req, schema);
  let url: URL;
  try {
    url = validateUrlShape(body.url, websiteAllowedHosts());
  } catch (error) {
    if (error instanceof UrlNotAllowedError) throw new ApiError("validation_error", error.message);
    throw error;
  }
  const source = await prisma.websiteSource.create({
    data: { url: url.toString(), categoryId: body.categoryId, language: body.language, title: body.title || null },
  });
  await audit(user.id, "website_source_added", "WebsiteSource", source.id, { url: source.url });
  try {
    await fetchWebsiteSource(source.id);
  } catch {
    // error is stored on the source and shown in the UI
  }
  return NextResponse.json({ source: await prisma.websiteSource.findUnique({ where: { id: source.id } }) }, { status: 201 });
});
