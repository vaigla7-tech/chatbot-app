import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/health - liveness plus dependency status. Never exposes secrets. */
export async function GET() {
  let database: "ok" | "unavailable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  const e = env();
  return NextResponse.json(
    {
      status: "ok",
      database,
      ai: { anthropic: Boolean(e.ANTHROPIC_API_KEY), openai: Boolean(e.OPENAI_API_KEY) },
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
