import type { ReactNode } from "react";

export function ChartCard({ title, subtitle, summary, children, visualsAccessible = false }: { title: string; subtitle?: string; summary: string; children: ReactNode; visualsAccessible?: boolean }) {
  return (
    <section className="card min-w-0 max-w-full overflow-hidden">
      <div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Analysis</p><h2 className="mt-1 text-lg font-semibold text-on-surface">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-on-surface-soft">{subtitle}</p> : null}</div>
      <p className="sr-only">{summary}</p>
      <div className="mt-5" aria-hidden={visualsAccessible ? undefined : "true"}>{children}</div>
    </section>
  );
}
