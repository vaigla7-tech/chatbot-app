import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";

export const dynamic = "force-dynamic";

export const GET = adminRoute("VIEWER", async () => {
  const errors = await prisma.operationalError.findMany({ orderBy: { timestamp: "desc" }, take: 100 });
  return NextResponse.json({ errors });
});
