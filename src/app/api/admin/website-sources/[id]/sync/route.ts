import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError } from "@/lib/http";
import { fetchWebsiteSource } from "@/lib/website";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/website-sources/:id/sync - re-fetch now; changes wait for approval. */
export const POST = adminRoute<{ id: string }>("EDITOR", async (_req, user, { id }) => {
  if (!(await prisma.websiteSource.findUnique({ where: { id } }))) throw new ApiError("not_found", "Source not found");
  try {
    const { changed } = await fetchWebsiteSource(id);
    await audit(user.id, "website_source_synced", "WebsiteSource", id, { changed });
    return NextResponse.json({ ok: true, changed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Fetch failed" }, { status: 502 });
  }
});
