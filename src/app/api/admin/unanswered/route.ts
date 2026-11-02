import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/unanswered?days=30 - unanswered questions aggregated by topic
 * category and language. Raw questions are never stored, so this reports topics only.
 */
export const GET = adminRoute("VIEWER", async (req) => {
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);
  const groups = await prisma.chatAnalyticsEvent.groupBy({
    by: ["category", "language", "answerStatus"],
    where: { eventType: "QUESTION", answered: false, timestamp: { gte: since } },
    _count: { _all: true },
  });
  return NextResponse.json({
    rangeDays: days,
    items: groups
      .map((g) => ({
        category: g.category ?? "uncategorized",
        language: g.language ?? "unknown",
        reason: g.answerStatus ?? "unknown",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  });
});
