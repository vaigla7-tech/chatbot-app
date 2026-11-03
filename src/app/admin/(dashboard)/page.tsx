"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";
import { BarList, DailyBars, StatTile, fmtLatency, pct } from "@/components/admin/charts";
import type { AnalyticsReport } from "@/components/admin/types";

interface DocSummary {
  documents: Array<{ processingStatus: string; publicationStatus: string }>;
}

export default function OverviewPage() {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocSummary["documents"]>([]);
  const [publishedFaqs, setPublishedFaqs] = useState(0);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    Promise.all([
      api<AnalyticsReport>("/api/admin/analytics?days=30").then(setReport),
      api<{ missingConfiguration: string[] }>("/api/admin/settings").then((r) => setMissing(r.missingConfiguration)),
      api<DocSummary>("/api/admin/documents").then((r) => setDocs(r.documents)),
      api<{ faqs: unknown[] }>("/api/admin/faqs?status=PUBLISHED").then((r) => setPublishedFaqs(r.faqs.length)),
    ]).catch((e) => setError((e as Error).message));
  }, []);

  const live = docs.filter((d) => d.publicationStatus === "PUBLISHED" && d.processingStatus === "READY").length;
  const failed = docs.filter((d) => d.processingStatus === "FAILED").length;
  const awaiting = docs.filter((d) => d.publicationStatus === "DRAFT" && d.processingStatus === "READY").length;
  const t = report?.totals;

  return (
    <>
      <PageHeader title="Overview" description="Last 30 days of chatbot activity and the state of the knowledge base." />
      <ErrorNote message={error} />

      {missing.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/60">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-4" /> Configuration needed
          </p>
          <ul className="mt-2 list-disc pl-6 text-sm text-amber-900">
            {missing.map((m) => (
              <li key={m}>Set <code>{m}</code> in Railway → Variables</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Chat sessions" value={t ? String(t.sessions) : "…"} />
        <StatTile label="Questions" value={t ? String(t.questions) : "…"} />
        <StatTile label="Answer coverage" value={t ? pct(t.answerCoverage) : "…"} hint="Answered from approved sources" />
        <StatTile label="Unanswered rate" value={t ? pct(t.unansweredRate) : "…"} />
        <StatTile label="Escalation rate" value={t ? pct(t.escalationRate) : "…"} hint={t ? `${t.escalationClicks} support clicks` : undefined} />
        <StatTile label="Feedback" value={t ? `${t.feedbackPositive} helpful · ${t.feedbackNegative} not` : "…"} />
        <StatTile label="Average latency" value={fmtLatency(t?.avgLatencyMs)} hint={t?.p95LatencyMs != null ? `p95 ${fmtLatency(t.p95LatencyMs)}` : undefined} />
        <StatTile label="Estimated AI cost" value={t ? `$${t.estimatedCostUsd.toFixed(2)}` : "…"} hint={t ? `${t.tokens.toLocaleString()} tokens` : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Questions per day</CardTitle>
          <div className="mt-4">{report && <DailyBars days={report.daily} />}</div>
        </Card>
        <Card>
          <CardTitle>Knowledge base</CardTitle>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-pine" /> {live} documents live in answers</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-pine" /> {publishedFaqs} published FAQs</li>
            <li>{awaiting} processed documents awaiting approval</li>
            <li className={failed ? "font-semibold text-red-700" : ""}>{failed} ingestion failures</li>
          </ul>
          <Link href="/admin/knowledge" className="mt-4 inline-block text-sm font-semibold text-ocean underline">Manage knowledge ›</Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Top unanswered topics</CardTitle>
          <div className="mt-4">
            <BarList rows={(report?.byCategory ?? []).filter((c) => c.unanswered > 0).slice(0, 8).map((c) => ({ label: c.category, value: c.unanswered }))} />
          </div>
        </Card>
        <Card>
          <CardTitle>Embed the website widget</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Add this snippet before <code>&lt;/body&gt;</code> on an authorised site. The site&apos;s origin must also be listed in the <code>WIDGET_ALLOWED_ORIGINS</code> variable.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-blackblue p-3 text-xs text-white">
            {`<script src="${origin}/embed.js" data-lang="en" defer></script>`}
          </pre>
        </Card>
      </div>
    </>
  );
}
