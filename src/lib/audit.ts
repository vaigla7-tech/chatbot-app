import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(
  adminUserId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { adminUserId, action, targetType, targetId: targetId ?? null, metadata } });
  } catch {
    console.error("[audit] failed to write audit log entry");
  }
}
