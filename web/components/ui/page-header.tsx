import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, eyebrow = "Overview", actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="flex min-w-0 max-w-full flex-col gap-4 border-b border-outline pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl whitespace-normal break-words text-sm text-on-surface-soft sm:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap gap-2 sm:shrink-0">{actions}</div> : null}
    </header>
  );
}
