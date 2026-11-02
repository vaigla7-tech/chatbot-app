import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** True when the error means PostgreSQL could not be reached. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const e = error as { name?: string; code?: string; errorCode?: string } | null;
  if (!e) return false;
  if (e.name === "PrismaClientInitializationError") return true;
  const code = e.code ?? e.errorCode;
  return code === "P1001" || code === "P1002" || code === "P1017" || code === "P2024";
}
