"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Breadcrumbs,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { formatMoney } from "@/lib/format-money";
import { useApiCall } from "@/lib/client-api";
import {
  buildPortfolioHoldings,
  currencyTotals,
  gainPercent,
  groupPortfolioHoldings,
  type CurrencyTotal,
  type PortfolioHolding,
} from "@/lib/portfolio-holdings";

type SavingsGroup = {
  id: string;
  name: string;
  currency?: string;
  isShareoutGroup?: boolean;
  currentBalance: number;
  contributedMinor: number;
};

function PortfolioLoading() {
  return (
    <PageShell>
      <LoadingSkeleton className="h-10" />
      <LoadingSkeleton className="h-44" />
      <LoadingSkeleton className="h-64" />
    </PageShell>
  );
}

export default function InvestmentsPage() {
  const apiCall = useApiCall();
  const { data, loading } = useUnifiedDashboard();
  const [savingsGroups, setSavingsGroups] = useState<SavingsGroup[]>([]);

  useEffect(() => {
    let ignore = false;
    void apiCall<SavingsGroup[]>("/v1/savings-groups")
      .then((groups) => {
        if (!ignore) setSavingsGroups(groups ?? []);
      })
      .catch(() => {
        // Stocks and bonds remain usable if savings-group data is unavailable.
      });
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  const reportingCurrency = data?.currency ?? data?.assets?.[0]?.currency ?? "ZMW";

  const { groups, totals, holdingCount, pendingCount } = useMemo(() => {
    const holdings = buildPortfolioHoldings({
      assets: data?.assets ?? [],
      savingsGroups,
      fallbackCurrency: reportingCurrency,
    });
    return {
      groups: groupPortfolioHoldings(holdings),
      totals: currencyTotals(holdings),
      holdingCount: holdings.filter((holding) => holding.hasPosition).length,
      pendingCount: holdings.filter((holding) => !holding.hasPosition).length,
    };
  }, [data?.assets, reportingCurrency, savingsGroups]);

  // The headline figure is whichever currency holds the most, so a portfolio
  // that is mostly dollars does not lead with an empty kwacha total.
  const headline: CurrencyTotal = totals[0] ?? {
    currency: reportingCurrency,
    currentValueMinor: 0,
    investedAmountMinor: 0,
  };
  const otherCurrencies = totals.slice(1);

  if (loading) return <PortfolioLoading />;

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", href: "/today" }, { label: "Portfolio" }]} />
      <PageHeader
        eyebrow="Portfolio"
        title="Portfolio"
        subtitle="Stocks, bonds, and savings groups in one place: what you put in, and what it is worth now."
        actions={
          <Link href="/investments/add" className="btn btn-primary">
            Add investment
          </Link>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No investments yet"
          description="Add a stock, a government bond, or a savings group and Chuma will track cost, current value, and gain for each of them here."
          action={
            <Link href="/investments/add" className="btn btn-primary">
              Add investment
            </Link>
          }
        />
      ) : (
        <>
          <PortfolioSummary
            headline={headline}
            otherCurrencies={otherCurrencies}
            holdingCount={holdingCount}
            pendingCount={pendingCount}
          />

          {groups.map((group) => (
            <section key={group.kind} className="card card-flush overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-outline p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
                    {group.label}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-on-surface">
                    {group.trackedCount}{" "}
                    {group.trackedCount === 1 ? "holding" : "holdings"}
                    {group.pendingCount ? ` · ${group.pendingCount} not yet bought` : ""}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-soft">{group.description}</p>
                </div>
                <div className="text-right">
                  {group.totals.length ? (
                    group.totals.map((total) => (
                      <p
                        key={total.currency}
                        className="font-display text-xl font-semibold tabular-nums text-on-surface"
                      >
                        {formatMoney(total.currentValueMinor, total.currency)}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-soft">No value recorded</p>
                  )}
                </div>
              </div>

              <ul>
                {group.holdings.map((holding) => (
                  <li key={holding.id} className="border-b border-outline last:border-0">
                    <HoldingRow holding={holding} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </PageShell>
  );
}

function PortfolioSummary({
  headline,
  otherCurrencies,
  holdingCount,
  pendingCount,
}: {
  headline: CurrencyTotal;
  otherCurrencies: CurrencyTotal[];
  holdingCount: number;
  pendingCount: number;
}) {
  const difference = headline.currentValueMinor - headline.investedAmountMinor;
  const percent = gainPercent(headline.currentValueMinor, headline.investedAmountMinor);

  return (
    <section className="card" aria-label="Portfolio summary">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
        Portfolio value
      </p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-on-surface sm:text-4xl">
        {formatMoney(headline.currentValueMinor, headline.currency)}
      </p>
      {otherCurrencies.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {otherCurrencies.map((total) => (
            <span
              key={total.currency}
              className="rounded-pill bg-surface-soft px-3 py-1 text-sm font-semibold tabular-nums text-on-surface-soft"
            >
              {formatMoney(total.currentValueMinor, total.currency)}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="mt-5 grid gap-4 border-t border-outline pt-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold text-on-surface-soft">Invested</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-on-surface">
            {formatMoney(headline.investedAmountMinor, headline.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-on-surface-soft">Gain or loss</dt>
          <dd
            className={`mt-1 text-xl font-semibold tabular-nums ${
              difference >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {difference >= 0 ? "+" : ""}
            {formatMoney(difference, headline.currency)}
            {percent === null ? null : (
              <span className="ml-2 text-sm">
                ({percent >= 0 ? "+" : ""}
                {percent.toFixed(1)}%)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-on-surface-soft">Holdings</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-on-surface">
            {holdingCount}
          </dd>
          {pendingCount ? (
            <p className="mt-1 text-xs text-on-surface-soft">
              {pendingCount} tracked but not yet bought
            </p>
          ) : null}
        </div>
      </dl>
      {otherCurrencies.length ? (
        <p className="mt-4 text-xs text-on-surface-soft">
          Invested and gain cover {headline.currency} holdings only. Currencies are never
          added together.
        </p>
      ) : null}
    </section>
  );
}

function HoldingRow({ holding }: { holding: PortfolioHolding }) {
  const difference = holding.currentValueMinor - holding.investedAmountMinor;
  const percent = gainPercent(holding.currentValueMinor, holding.investedAmountMinor);

  return (
    <Link
      href={holding.href}
      className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-on-surface">{holding.name}</p>
        <p className="mt-0.5 text-xs text-on-surface-soft">
          {holding.meta}
          {holding.currency ? ` · ${holding.currency}` : ""}
        </p>
      </div>
      {holding.hasPosition ? (
        <div className="text-right">
          <p className="font-semibold tabular-nums text-on-surface">
            {formatMoney(holding.currentValueMinor, holding.currency)}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-on-surface-soft">
            Cost {formatMoney(holding.investedAmountMinor, holding.currency)}
            <span
              className={`ml-2 font-semibold ${
                difference >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {difference >= 0 ? "+" : ""}
              {formatMoney(difference, holding.currency)}
              {percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}
            </span>
          </p>
        </div>
      ) : (
        <div className="text-right">
          <span className="rounded-pill bg-surface-soft px-3 py-1 text-xs font-semibold text-on-surface-soft">
            Nothing bought yet
          </span>
          <p className="mt-1 text-xs text-on-surface-soft">Not counted in totals</p>
        </div>
      )}
    </Link>
  );
}
