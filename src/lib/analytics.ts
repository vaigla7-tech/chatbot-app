import { prisma } from "./db";
import { getConfig } from "./config";

/**
 * Privacy-safe analytics. Callers must never pass message text, IP addresses or
 * other identifying data. Failures are swallowed so analytics never breaks chat.
 */
export interface AnalyticsEventInput {
  anonSessionId?: string | null;
  eventType: "SESSION_START" | "QUESTION" | "ERROR" | "FEEDBACK";
  language?: string | null;
  category?: string | null;
  answered?: boolean | null;
  answerStatus?: string | null;
  escalated?: boolean;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  provider?: string | null;
  model?: string | null;
  feedback?: number | null;
}

export async function recordEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    await prisma.chatAnalyticsEvent.create({
      data: {
        ...event,
        tokenCount:
          event.inputTokens != null || event.outputTokens != null
            ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
            : null,
      },
    });
  } catch {
    // ignore - analytics is best-effort
  }
}

/** Log a sanitized operational error for the admin dashboard. */
export async function recordOperationalError(input: {
  source: string;
  provider?: string | null;
  code: string;
  message: string;
}): Promise<void> {
  try {
    await prisma.operationalError.create({
      data: { ...input, message: input.message.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[key]").slice(0, 500) },
    });
  } catch {
    // ignore
  }
}

let lastPurge = 0;

/** Delete analytics older than the configured retention period (runs at most hourly). */
export async function purgeExpiredAnalytics(force = false): Promise<number> {
  if (!force && Date.now() - lastPurge < 3_600_000) return 0;
  lastPurge = Date.now();
  const { retentionDays } = await getConfig("analytics");
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const [a, b, c] = await prisma.$transaction([
    prisma.chatAnalyticsEvent.deleteMany({ where: { timestamp: { lt: cutoff } } }),
    prisma.escalationEvent.deleteMany({ where: { timestamp: { lt: cutoff } } }),
    prisma.operationalError.deleteMany({ where: { timestamp: { lt: cutoff } } }),
  ]);
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return a.count + b.count + c.count;
}
