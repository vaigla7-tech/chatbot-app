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

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  _count?: { documents: number; faqs: number };
}
