"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, Money, PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";

type BondPosition = {
  assetId: string;
  issueDate: string;
  maturityDate: string;
};

/**
 * Realised bond performance per currency, from /v1/bonds/summary.
 *
 * The received fields count posted coupons only. Outstanding is money still
 * scheduled and is deliberately kept out of every gain figure.
 */
type BondCurrencySummary = {
  currency: string;
  holdingCount: number;
  principalMinor: number;
  couponGrossReceivedMinor: number;
  couponTaxWithheldMinor: number;
  couponNetReceivedMinor: number;
  couponsReceivedCount: number;
  reinvestedMinor: number;
  paidToCashMinor: number;
  principalRedeemedMinor: number;
  couponNetOutstandingMinor: number;
  nextCouponDate?: string;
  nextCouponNetMinor: number;
};

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Coupon income to date as a share of principal. */
function incomeYield(receivedMinor: number, principalMinor: number) {
  if (principalMinor <= 0) return null;
  return (receivedMinor / principalMinor) * 100;
}

export default function BondsDashboardPage() {
  const apiCall = useApiCall();
  const { data, loading } = useUnifiedDashboard();
  const [positions, setPositions] = useState<BondPosition[]>([]);
  const [summaries, setSummaries] = useState<BondCurrencySummary[] | null>(null);
  // Distinguished from "no coupons yet": showing a confident zero when the
  // request failed would misreport income.
  const [summaryFailed, setSummaryFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    void apiCall<BondPosition[]>("/v1/bonds")
      .then((result) => {
        if (!ignore) setPositions(result ?? []);
      })
      // Dates are supporting detail; the holdings themselves still render
      // without them, so a failure here does not block the page.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  useEffect(() => {
    let ignore = false;
    void apiCall<BondCurrencySummary[]>("/v1/bonds/summary")
      .then((result) => {
        if (ignore) return;
        setSummaries(result ?? []);
        setSummaryFailed(false);
      })
      .catch(() => {
        if (ignore) return;
        setSummaries(null);
        setSummaryFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  const summaryByCurrency = useMemo(
    () => new Map((summaries ?? []).map((summary) => [summary.currency, summary])),
    [summaries],
  );

  const datesByAsset = useMemo(
    () => new Map(positions.map((position) => [position.assetId, position])),
    [positions],
  );
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
              const summary = summaryByCurrency.get(currency);
              const received = summary?.couponNetReceivedMinor ?? 0;
              // Against principal held, not current value: a bond is carried at
              // principal, so value-based percentages say nothing.
              const yieldToDate = incomeYield(received, total.cost);
              return (
                <article className="card" key={currency}>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Current value</p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">{formatMoney(total.value, currency)}</p>
                  <p className="mt-2 text-sm text-on-surface-soft">
                    Principal {formatMoney(total.cost, currency)}
                    {summary?.principalRedeemedMinor
                      ? ` · ${formatMoney(summary.principalRedeemedMinor, currency)} redeemed`
                      : ""}
                  </p>

                  {/* A bond's return is its coupons, not a change in carrying
                      value, so this is the gain figure rather than value less
                      cost — which is structurally zero for a bond's whole life. */}
                  <div className="mt-4 border-t border-outline pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
                      Coupon income received
                    </p>

                    {summaryFailed ? (
                      <p className="mt-2 text-sm text-on-surface-soft">
                        We couldn&apos;t load coupon income. Reload to try again.
                      </p>
                    ) : summaries === null ? (
                      <LoadingSkeleton className="mt-2 h-8" />
                    ) : (
                      <>
                        <p className="mt-2 font-display text-2xl font-semibold">
                          <Money amountMinor={received} currency={currency} signed tone={received > 0 ? "positive" : "neutral"} />
                        </p>
                        <p className="mt-1 text-sm text-on-surface-soft">
                          {summary?.couponsReceivedCount
                            ? `${summary.couponsReceivedCount} ${summary.couponsReceivedCount === 1 ? "payment" : "payments"}${
                                yieldToDate === null ? "" : ` · ${yieldToDate.toFixed(1)}% of principal`
                              }`
                            : "No coupons paid yet"}
                        </p>

                        {summary?.couponTaxWithheldMinor ? (
                          <p className="mt-1 text-xs text-on-surface-soft">
                            {formatMoney(summary.couponGrossReceivedMinor, currency)} gross, less{" "}
                            {formatMoney(summary.couponTaxWithheldMinor, currency)} withholding tax
                          </p>
                        ) : null}

                        {summary?.reinvestedMinor ? (
                          <p className="mt-1 text-xs text-on-surface-soft">
                            {formatMoney(summary.reinvestedMinor, currency)} reinvested ·{" "}
                            {formatMoney(summary.paidToCashMinor, currency)} paid to cash
                          </p>
                        ) : null}

                        {/* Kept visually separate and never folded into the gain:
                            this money has not been paid. */}
                        {summary?.couponNetOutstandingMinor ? (
                          <p className="mt-3 text-xs text-on-surface-soft">
                            Still scheduled {formatMoney(summary.couponNetOutstandingMinor, currency)}
                            {summary.nextCouponDate
                              ? ` · next ${formatMoney(summary.nextCouponNetMinor, currency)} on ${formatDay(summary.nextCouponDate)}`
                              : ""}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="card card-flush overflow-hidden">
            <div className="border-b border-outline p-5"><h2 className="font-semibold text-on-surface">Bond holdings</h2></div>
            <ul>
              {bonds.map((bond) => {
                const dates = datesByAsset.get(bond.assetId);
                const issued = dates ? formatMonth(dates.issueDate) : "";
                const matures = dates ? formatMonth(dates.maturityDate) : "";
                return (
                <li key={bond.assetId} className="border-b border-outline last:border-0">
                  <Link href={`/investments/${bond.assetId}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-surface-soft">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{bond.name}</p>
                      <p className="mt-1 text-xs text-on-surface-soft">
                        {[
                          bond.symbol || "Government bond",
                          issued ? `Bought ${issued}` : "",
                          matures ? `Matures ${matures}` : "",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {bond.hasPosition ? (
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-on-surface">{formatMoney(bond.currentValueMinor, bond.currency)}</p>
                        <p className="mt-1 text-xs text-on-surface-soft">Principal {formatMoney(bond.investedAmountMinor, bond.currency)}</p>
                      </div>
                    ) : <span className="shrink-0 text-sm text-on-surface-soft">Nothing invested yet</span>}
                  </Link>
                </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  );
}
