import { prisma } from "./db";

export interface AnalyticsReport {
  rangeDays: number;
  totals: {
    sessions: number;
    questions: number;
    answered: number;
    unanswered: number;
    errors: number;
    answerCoverage: number | null;
    unansweredRate: number | null;
    escalationRate: number | null;
    escalationClicks: number;
    feedbackPositive: number;
    feedbackNegative: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    tokens: number;
    estimatedCostUsd: number;
  };
  daily: Array<{ day: string; questions: number; answered: number; escalated: number }>;
  byCategory: Array<{ category: string; questions: number; unanswered: number }>;
  byLanguage: Array<{ language: string; questions: number }>;
  escalationsByReason: Array<{ reasonCode: string; count: number }>;
  byModel: Array<{ provider: string; model: string; questions: number; tokens: number; costUsd: number }>;
}

const ratio = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 1000);

export async function buildAnalyticsReport(rangeDays: number): Promise<AnalyticsReport> {
  const since = new Date(Date.now() - rangeDays * 86_400_000);
  const where = { timestamp: { gte: since } };

  const [sessions, questionAgg, statusGroups, categoryGroups, languageGroups, feedback, escalations, modelGroups, latency, daily] =
    await Promise.all([
      prisma.chatAnalyticsEvent.findMany({
        where: { ...where, eventType: "SESSION_START" },
        distinct: ["anonSessionId"],
        select: { anonSessionId: true },
      }),
      prisma.chatAnalyticsEvent.aggregate({
        where: { ...where, eventType: { in: ["QUESTION", "ERROR"] } },
        _count: { _all: true },
        _avg: { latencyMs: true },
        _sum: { tokenCount: true, estimatedCost: true },
      }),
      prisma.chatAnalyticsEvent.groupBy({
        by: ["eventType", "answered", "escalated"],
        where: { ...where, eventType: { in: ["QUESTION", "ERROR"] } },
        _count: { _all: true },
      }),
      prisma.chatAnalyticsEvent.groupBy({
        by: ["category", "answered"],
        where: { ...where, eventType: "QUESTION" },
        _count: { _all: true },
      }),
      prisma.chatAnalyticsEvent.groupBy({
        by: ["language"],
        where: { ...where, eventType: "QUESTION" },
        _count: { _all: true },
      }),
      prisma.chatAnalyticsEvent.groupBy({
        by: ["feedback"],
        where: { ...where, eventType: "FEEDBACK" },
        _count: { _all: true },
      }),
      prisma.escalationEvent.groupBy({
        by: ["reasonCode", "status"],
        where,
        _count: { _all: true },
      }),
      prisma.chatAnalyticsEvent.groupBy({
        by: ["provider", "model"],
        where: { ...where, eventType: "QUESTION", provider: { not: null } },
        _count: { _all: true },
        _sum: { tokenCount: true, estimatedCost: true },
      }),
      prisma.$queryRaw<Array<{ p95: number | null }>>`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
        FROM "ChatAnalyticsEvent" WHERE "eventType" = 'QUESTION' AND "timestamp" >= ${since} AND "latencyMs" IS NOT NULL`,
      prisma.$queryRaw<Array<{ day: Date; questions: bigint; answered: bigint; escalated: bigint }>>`
        SELECT date_trunc('day', "timestamp") AS day,
               COUNT(*) AS questions,
               COUNT(*) FILTER (WHERE answered) AS answered,
               COUNT(*) FILTER (WHERE escalated) AS escalated
        FROM "ChatAnalyticsEvent"
        WHERE "eventType" = 'QUESTION' AND "timestamp" >= ${since}
        GROUP BY 1 ORDER BY 1`,
    ]);

  let questions = 0;
  let answered = 0;
  let errors = 0;
  let escalated = 0;
  for (const g of statusGroups) {
    if (g.eventType === "ERROR") {
      errors += g._count._all;
      continue;
    }
    questions += g._count._all;
    if (g.answered) answered += g._count._all;
    if (g.escalated) escalated += g._count._all;
  }

  const categories = new Map<string, { questions: number; unanswered: number }>();
  for (const g of categoryGroups) {
    const key = g.category ?? "uncategorized";
    const entry = categories.get(key) ?? { questions: 0, unanswered: 0 };
    entry.questions += g._count._all;
    if (!g.answered) entry.unanswered += g._count._all;
    categories.set(key, entry);
  }

  const reasons = new Map<string, number>();
  let clicks = 0;
  for (const g of escalations) {
    if (g.status === "clicked") clicks += g._count._all;
    reasons.set(g.reasonCode, (reasons.get(g.reasonCode) ?? 0) + g._count._all);
  }

  return {
    rangeDays,
    totals: {
      sessions: sessions.length,
      questions,
      answered,
      unanswered: questions - answered,
      errors,
      answerCoverage: ratio(answered, questions),
      unansweredRate: ratio(questions - answered, questions),
      escalationRate: ratio(escalated, questions),
      escalationClicks: clicks,
      feedbackPositive: feedback.find((f) => f.feedback === 1)?._count._all ?? 0,
      feedbackNegative: feedback.find((f) => f.feedback === -1)?._count._all ?? 0,
      avgLatencyMs: questionAgg._avg.latencyMs ? Math.round(questionAgg._avg.latencyMs) : null,
      p95LatencyMs: latency[0]?.p95 != null ? Math.round(Number(latency[0].p95)) : null,
      tokens: questionAgg._sum.tokenCount ?? 0,
      estimatedCostUsd: Math.round((questionAgg._sum.estimatedCost ?? 0) * 10000) / 10000,
    },
    daily: daily.map((d) => ({
      day: d.day.toISOString().slice(0, 10),
      questions: Number(d.questions),
      answered: Number(d.answered),
      escalated: Number(d.escalated),
    })),
    byCategory: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.questions - a.questions),
    byLanguage: languageGroups
      .map((g) => ({ language: g.language ?? "unknown", questions: g._count._all }))
      .sort((a, b) => b.questions - a.questions),
    escalationsByReason: [...reasons.entries()].map(([reasonCode, count]) => ({ reasonCode, count })).sort((a, b) => b.count - a.count),
    byModel: modelGroups.map((g) => ({
      provider: g.provider ?? "-",
      model: g.model ?? "-",
      questions: g._count._all,
      tokens: g._sum.tokenCount ?? 0,
      costUsd: Math.round((g._sum.estimatedCost ?? 0) * 10000) / 10000,
    })),
  };
}
