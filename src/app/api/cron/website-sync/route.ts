import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { fetchWebsiteSource } from "@/lib/website";
import { recordOperationalError } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/website-sync - Phase 2 automatic synchronisation (disabled per
 * source by default). Call from a Railway cron service with
 * `Authorization: Bearer <HMAC-SHA256(ADMIN_AUTH_SECRET, "website-sync")>`.
 * Detected changes are staged for administrator approval, never auto-published.
 */
export async function POST(req: Request) {
  const secret = env().ADMIN_AUTH_SECRET;
  if (!secret) return jsonError("unauthorized", "Not configured");
  const expected = Buffer.from(createHmac("sha256", secret).update("website-sync").digest("hex"));
  const provided = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return jsonError("unauthorized", "Unauthorized");

  const sources = await prisma.websiteSource.findMany({ where: { enabled: true, syncEnabled: true, approvalStatus: "APPROVED" } });
  let changed = 0;
  let failed = 0;
  for (const source of sources) {
    try {
      if ((await fetchWebsiteSource(source.id)).changed) changed++;
    } catch {
      failed++;
      await recordOperationalError({ source: "website-sync", code: "sync_failed", message: `Source ${source.id} could not be synchronised` });
    }
  }
  return NextResponse.json({ checked: sources.length, changed, failed });
}
