import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";

export const dynamic = "force-dynamic";

export const GET = adminRoute("ADMIN", async () => {
  const entries = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
    include: { adminUser: { select: { email: true, name: true } } },
  });
  return NextResponse.json({ entries });
});
