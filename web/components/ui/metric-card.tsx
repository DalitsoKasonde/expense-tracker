import type { ReactNode } from "react";

type Tone = "default" | "income" | "expense" | "savings" | "investment";
const tones: Record<Tone, string> = {
  default: "text-primary bg-primary-softer",
  income: "text-income bg-income-soft",
  expense: "text-expense bg-expense-soft",
  savings: "text-savings bg-savings-soft",
  investment: "text-investment bg-investment-soft",
};

export function MetricCard({ label, value, detail, delta, tone = "default", chart }: {
  label: string; value: string; detail?: string; delta?: number | null; tone?: Tone; chart?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-outline bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</p>
        <span className={`size-2 rounded-full ${tones[tone]}`} aria-hidden="true" />
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-on-surface">{value}</p>
      {(detail || delta !== undefined) ? <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {delta !== undefined && delta !== null ? <span className={delta >= 0 ? "font-semibold text-positive" : "font-semibold text-negative"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span> : null}
        {detail ? <span className="text-on-surface-soft">{detail}</span> : null}
      </div> : null}
      {chart ? <div className="mt-4">{chart}</div> : null}
    </article>
  );
}
