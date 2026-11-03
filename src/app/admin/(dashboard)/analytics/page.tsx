"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";
import { BarList, DailyBars, StatTile, fmtLatency, pct } from "@/components/admin/charts";
import type { AnalyticsReport } from "@/components/admin/types";
import { LANGUAGES, isLanguageCode } from "@/lib/languages";

interface Unanswered {
  items: Array<{ category: string; language: string; reason: string; count: number }>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [unanswered, setUnanswered] = useState<Unanswered["items"]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<AnalyticsReport>(`/api/admin/analytics?days=${days}`).then(setReport),
      api<Unanswered>(`/api/admin/unanswered?days=${days}`).then((r) => setUnanswered(r.items)),
    ]).catch((e) => setError((e as Error).message));
  }, [days]);

  const t = report?.totals;
  const langName = (code: string) => (isLanguageCode(code) ? LANGUAGES[code].name : code);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Aggregated, privacy-safe usage data. Investor messages are never stored; questions are counted by topic category and language only."
        actions={[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "secondary"} onClick={() => setDays(d)}>
            {d} days
          </Button>
        ))}
      />
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Questions" value={t ? String(t.questions) : "…"} />
        <StatTile label="Answered" value={t ? pct(t.answerCoverage) : "…"} hint={t ? `${t.answered} answered` : undefined} />
        <StatTile label="Unanswered" value={t ? pct(t.unansweredRate) : "…"} hint={t ? `${t.unanswered} questions` : undefined} />
        <StatTile label="Provider errors" value={t ? String(t.errors) : "…"} />
        <StatTile label="Escalation rate" value={t ? pct(t.escalationRate) : "…"} />
        <StatTile label="Average latency" value={fmtLatency(t?.avgLatencyMs)} />
        <StatTile label="p95 latency" value={fmtLatency(t?.p95LatencyMs)} />
        <StatTile label="Estimated cost" value={t ? `$${t.estimatedCostUsd.toFixed(2)}` : "…"} hint={t ? `${t.tokens.toLocaleString()} tokens` : undefined} />
      </div>

      <Card className="mt-6">
        <CardTitle>Questions per day</CardTitle>
        <div className="mt-4">{report && <DailyBars days={report.daily} />}</div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Most frequent topics</CardTitle>
          <div className="mt-4">
            <BarList rows={(report?.byCategory ?? []).slice(0, 10).map((c) => ({ label: c.category, value: c.questions }))} />
          </div>
        </Card>
        <Card>
          <CardTitle>Language usage</CardTitle>
          <div className="mt-4">
            <BarList rows={(report?.byLanguage ?? []).map((l) => ({ label: langName(l.language), value: l.questions }))} />
          </div>
        </Card>
        <Card>
          <CardTitle>Unanswered questions by topic</CardTitle>
          <p className="mt-1 text-xs text-muted">Use this to decide which documentation or FAQs to add next.</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke text-xs text-muted">
                <th className="py-1.5 font-medium">Topic</th>
                <th className="py-1.5 font-medium">Language</th>
                <th className="py-1.5 font-medium">Reason</th>
                <th className="py-1.5 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {unanswered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-muted">
                    No unanswered questions in this period.
                  </td>
                </tr>
              )}
              {unanswered.slice(0, 20).map((u) => (
                <tr key={`${u.category}-${u.language}-${u.reason}`} className="border-b border-stroke/60">
                  <td className="py-1.5">{u.category}</td>
                  <td className="py-1.5">{langName(u.language)}</td>
                  <td className="py-1.5 text-muted">{u.reason.replaceAll("_", " ")}</td>
                  <td className="py-1.5 text-right tabular-nums">{u.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>Escalations by reason</CardTitle>
          <div className="mt-4">
            <BarList rows={(report?.escalationsByReason ?? []).map((r) => ({ label: r.reasonCode.replaceAll("_", " "), value: r.count }))} />
          </div>
          <p className="mt-3 text-xs text-muted">{t ? `${t.escalationClicks} investors opened a support channel.` : ""}</p>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>AI usage by model</CardTitle>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke text-xs text-muted">
                <th className="py-1.5 font-medium">Provider</th>
                <th className="py-1.5 font-medium">Model</th>
                <th className="py-1.5 text-right font-medium">Questions</th>
                <th className="py-1.5 text-right font-medium">Tokens</th>
                <th className="py-1.5 text-right font-medium">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {(report?.byModel ?? []).map((m) => (
                <tr key={`${m.provider}-${m.model}`} className="border-b border-stroke/60">
                  <td className="py-1.5 capitalize">{m.provider}</td>
                  <td className="py-1.5">{m.model}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.questions}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.tokens.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">${m.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Costs are estimates from list prices and may differ from provider invoices.</p>
        </Card>
      </div>
    </>
  );
}
