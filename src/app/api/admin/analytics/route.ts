import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { buildAnalyticsReport } from "@/lib/analytics-report";
import { purgeExpiredAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/admin/analytics?days=30 - aggregated, privacy-safe usage analytics. */
export const GET = adminRoute("VIEWER", async (req) => {
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30) || 30, 1), 365);
  await purgeExpiredAnalytics().catch(() => 0);
  return NextResponse.json(await buildAnalyticsReport(days));
});
