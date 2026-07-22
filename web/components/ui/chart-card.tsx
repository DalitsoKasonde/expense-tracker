import type { ReactNode } from "react";

export function ChartCard({ title, subtitle, summary, children }: { title: string; subtitle?: string; summary: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm">
      <div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Analysis</p><h2 className="mt-1 text-lg font-semibold text-on-surface">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-on-surface-soft">{subtitle}</p> : null}</div>
      <p className="sr-only">{summary}</p>
      <div className="mt-5" aria-hidden="true">{children}</div>
    </section>
  );
}
