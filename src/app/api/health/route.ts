import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Map a database failure to a short, secret-free diagnosis for operators. */
function diagnose(error: unknown): string {
  const e = error as { name?: string; code?: string; errorCode?: string; message?: string } | null;
  const code = e?.code ?? e?.errorCode;
  const message = e?.message ?? "";
  if (code === "P1000") return "authentication_failed: DATABASE_URL user or password is wrong";
  if (code === "P1001") return "unreachable: the database host in DATABASE_URL cannot be reached";
  if (code === "P1003") return "database_missing: the database named in DATABASE_URL does not exist";
  if (code === "P1013" || /invalid.*(url|connection string)|must start with the protocol/i.test(message))
    return "invalid_url: DATABASE_URL is not a valid postgresql:// URL (an unresolved ${{...}} reference?)";
  if (code === "P2021" || /relation .* does not exist|table .* does not exist/i.test(message))
    return "not_migrated: tables are missing - the pre-deploy migration has not run";
  return `error${code ? ` ${code}` : ""}: ${e?.name ?? "unknown"}`;
}

/** GET /api/health - liveness plus dependency status. Never exposes secrets. */
export async function GET() {
  const e = env();
  let database: "ok" | "unavailable" = "ok";
  let databaseDetail: string | undefined;
  if (!e.DATABASE_URL) {
    database = "unavailable";
    databaseDetail = "not_configured: DATABASE_URL is not set on this service";
  } else {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await prisma.supportedLanguage.count();
    } catch (error) {
      database = "unavailable";
      databaseDetail = diagnose(error);
    }
  }
  return NextResponse.json(
    {
      status: "ok",
      database,
      ...(databaseDetail ? { databaseDetail } : {}),
      ai: { anthropic: Boolean(e.ANTHROPIC_API_KEY), openai: Boolean(e.OPENAI_API_KEY) },
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
