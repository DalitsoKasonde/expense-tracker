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
    <article className="card dashboardMetricCard">
      <div className="flex items-start justify-between gap-3">
        <p className="dashboardMetricLabel">{label}</p>
        <span className={`dashboardMetricDot ${tones[tone]}`} aria-hidden="true" />
      </div>
      <p className="dashboardMetricValue tabular-nums">{value}</p>
      {(detail || delta !== undefined) ? <div className="dashboardMetricDetail">
        {delta !== undefined && delta !== null ? <span className={delta >= 0 ? "font-semibold text-positive" : "font-semibold text-negative"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span> : null}
        {detail ? <span className="text-on-surface-soft">{detail}</span> : null}
      </div> : null}
      {chart ? <div className="mt-4">{chart}</div> : null}
    </article>
  );
}
