"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, PageHeader, PageShell } from "@/components/ui";
import { formatMoney } from "@/lib/format-money";
import { gainPercent } from "@/lib/portfolio-holdings";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";

export default function BondsDashboardPage() {
  const { data, loading } = useUnifiedDashboard();
  const bonds = useMemo(
    () => (data?.assets ?? []).filter((asset) => asset.assetClass === "bond").sort((a, b) => b.currentValueMinor - a.currentValueMinor),
    [data?.assets],
  );
  const totals = useMemo(() => {
    const byCurrency = new Map<string, { value: number; cost: number }>();
    for (const bond of bonds) {
      if (!bond.hasPosition) continue;
      const total = byCurrency.get(bond.currency) ?? { value: 0, cost: 0 };
      total.value += bond.currentValueMinor;
      total.cost += bond.investedAmountMinor;
      byCurrency.set(bond.currency, total);
    }
    return [...byCurrency.entries()];
  }, [bonds]);

  if (loading) return <PageShell><LoadingSkeleton className="h-10" /><LoadingSkeleton className="h-40" /><LoadingSkeleton className="h-64" /></PageShell>;

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Portfolio", href: "/investments" }, { label: "Government bonds" }]} />
      <PageHeader
        eyebrow="Bond dashboard"
        title="Government bonds"
        subtitle="Manage principal, coupon payments, reinvestment, and maturity from one focused dashboard."
        actions={<Link href="/investments/add?type=bond" className="btn btn-primary">Add bond</Link>}
      />

      {bonds.length === 0 ? (
        <EmptyState title="No government bonds yet" description="Add a bond to track its principal, coupons, and maturity." action={<Link href="/investments/add?type=bond" className="btn btn-primary">Add bond</Link>} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Bond portfolio summary">
            {totals.map(([currency, total]) => {
              const difference = total.value - total.cost;
              const percent = gainPercent(total.value, total.cost);
              return (
                <article className="card" key={currency}>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Current value</p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">{formatMoney(total.value, currency)}</p>
                  <p className="mt-2 text-sm text-on-surface-soft">Principal {formatMoney(total.cost, currency)}</p>
                  <p className={`mt-1 text-sm font-semibold ${difference >= 0 ? "text-positive" : "text-negative"}`}>
                    {difference >= 0 ? "+" : ""}{formatMoney(difference, currency)}{percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}
                  </p>
                </article>
              );
            })}
          </section>

          <section className="card card-flush overflow-hidden">
            <div className="border-b border-outline p-5"><h2 className="font-semibold text-on-surface">Bond holdings</h2></div>
            <ul>
              {bonds.map((bond) => (
                <li key={bond.assetId} className="border-b border-outline last:border-0">
                  <Link href={`/investments/${bond.assetId}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-surface-soft">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{bond.name}</p>
                      <p className="mt-1 text-xs text-on-surface-soft">{bond.symbol || "Government bond"} · Manage coupons and maturity</p>
                    </div>
                    {bond.hasPosition ? (
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-on-surface">{formatMoney(bond.currentValueMinor, bond.currency)}</p>
                        <p className="mt-1 text-xs text-on-surface-soft">Principal {formatMoney(bond.investedAmountMinor, bond.currency)}</p>
                      </div>
                    ) : <span className="shrink-0 text-sm text-on-surface-soft">Nothing invested yet</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  );
}
