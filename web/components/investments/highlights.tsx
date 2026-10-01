import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function signedPercent(percent: number) {
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export function shortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One line of a highlights card: a label, the finding, and its context. */
export function Highlight({ label, children, detail }: { label: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <li className="grid gap-1 border-b border-outline py-3 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</span>
      <span className="min-w-0 text-sm text-on-surface">
        {children}
        {detail ? <span className="block text-on-surface-soft sm:inline sm:before:content-['_·_']">{detail}</span> : null}
      </span>
    </li>
  );
}

/**
 * The holdings worth knowing about, one line each. Callers render nothing
 * when they have no lines, rather than an empty card.
 */
export function HighlightsCard({ id, note, children }: { id: string; note?: string; children: ReactNode }) {
  return (
    <Card aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold text-on-surface">Highlights</h2>
      {note ? <p className="mt-1 text-sm text-on-surface-soft">{note}</p> : null}
      <ul className="mt-2">{children}</ul>
    </Card>
  );
}
