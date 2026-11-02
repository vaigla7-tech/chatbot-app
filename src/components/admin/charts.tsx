"use client";

import { useState } from "react";

/** KPI tile: the number is the headline, so no chart is needed. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stroke bg-white p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Single-series horizontal magnitude bars (one hue). Values are text, never coloured. */
export function BarList({ rows, valueLabel = "" }: { rows: Array<{ label: string; value: number; sub?: string }>; valueLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-4 text-sm text-muted">No data for this period.</p>;
  return (
    <ul className="flex flex-col gap-2" role="list">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${r.value}${valueLabel}`}>
          <span className="truncate text-ink">{r.label}</span>
          <span className="h-2.5 rounded-r bg-lilac">
            <span className="block h-full rounded-r bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted">
            {r.value}
            {valueLabel}
            {r.sub ? <span className="ml-1 text-[11px]">{r.sub}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Daily questions as single-series vertical bars with a hover tooltip and a table fallback. */
export function DailyBars({ days }: { days: Array<{ day: string; questions: number; answered: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return <p className="py-4 text-sm text-muted">No questions in this period.</p>;
  const max = Math.max(1, ...days.map((d) => d.questions));
  const active = hover !== null ? days[hover] : null;
  return (
    <figure>
      <div className="relative h-40" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-stroke" aria-hidden />
        <div className="flex h-full items-end gap-[2px]">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="group flex h-full flex-1 items-end focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${d.day}: ${d.questions} questions, ${d.answered} answered`}
            >
              <span
                className={`block w-full rounded-t-[4px] ${hover === i ? "bg-ocean" : "bg-brand"}`}
                style={{ height: `${Math.max(2, (d.questions / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        {active && (
          <div className="pointer-events-none absolute -top-2 right-0 rounded-lg border border-stroke bg-white px-2.5 py-1.5 text-xs shadow-sm">
            <p className="font-semibold text-ink">{active.day}</p>
            <p className="text-muted">
              {active.questions} questions · {active.answered} answered
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{days[0]?.day}</span>
        <span>Peak {max} / day</span>
        <span>{days[days.length - 1]?.day}</span>
      </figcaption>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-ocean">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-stroke text-muted">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Questions</th>
              <th className="py-1 font-medium">Answered</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-b border-stroke/60">
                <td className="py-1">{d.day}</td>
                <td className="py-1 tabular-nums">{d.questions}</td>
                <td className="py-1 tabular-nums">{d.answered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 1000) / 10}%`);
