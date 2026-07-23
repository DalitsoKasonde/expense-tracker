import { formatMoney } from "@/lib/format-money";
import Link from "next/link";
import type { Route } from "next";

export function SavingsGoalCard({ name, currentMinor, targetMinor, currency, href }: { name: string; currentMinor: number; targetMinor: number; currency: string; href?: Route }) {
  const percentage = targetMinor > 0 ? Math.min(100, Math.round((currentMinor / targetMinor) * 100)) : 0;
  const card = (
    <article className="h-full rounded-lg border border-outline bg-surface p-5 shadow-sm transition hover:border-primary hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-semibold text-on-surface">{name}</p><p className="mt-1 text-xs text-on-surface-soft">{formatMoney(currentMinor, currency)} of {formatMoney(targetMinor, currency)}</p></div>
        <strong className="text-sm text-savings">{percentage}%</strong>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-pill bg-surface-soft" role="progressbar" aria-label={`${name} progress`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-pill bg-savings" style={{ width: `${percentage}%` }} />
      </div>
    </article>
  );
  return href ? <Link href={href} aria-label={`Open ${name} savings goal`}>{card}</Link> : card;
}
