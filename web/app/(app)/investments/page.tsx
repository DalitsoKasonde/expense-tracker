"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, Money, PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useEntriesChanged } from "@/lib/entries-bus";
import { formatMoney } from "@/lib/format-money";
import {
  buildPortfolioHoldings,
  currencyTotals,
  gainPercent,
  groupPortfolioHoldings,
  type CurrencyTotal,
  type PortfolioGroup,
} from "@/lib/portfolio-holdings";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";

type SavingsGroup = {
  id: string;
  name: string;
  currency?: string;
  isShareoutGroup?: boolean;
  currentBalance: number;
  contributedMinor: number;
};

type SavingsPocket = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  currentBalanceMinor: number;
  netContributionsMinor: number;
  interestEarnedMinor: number;
};

const dashboardRoutes = {
  stock: "/investments/stocks",
  bond: "/investments/bonds",
  savings_pocket: "/investments/savings-pockets",
  savings_group: "/investments/savings-groups",
} as const;

export default function InvestmentsPage() {
  const apiCall = useApiCall();
  const { data, loading, reload } = useUnifiedDashboard();
  const [savingsGroups, setSavingsGroups] = useState<SavingsGroup[]>([]);
  const [savingsPockets, setSavingsPockets] = useState<SavingsPocket[]>([]);
  // Bumping this re-runs the fetch effect below so a newly saved investment
  // entry shows up without a manual reload.
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      apiCall<SavingsGroup[]>("/v1/savings-groups").catch(() => []),
      apiCall<SavingsPocket[]>("/v1/savings-pockets").catch(() => []),
    ])
      .then(([groups, pockets]) => {
        if (!ignore) {
          setSavingsGroups(groups ?? []);
          setSavingsPockets(pockets ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [apiCall, reloadNonce]);

  useEntriesChanged(() => {
    reload();
    setReloadNonce((nonce) => nonce + 1);
  });

  const reportingCurrency = data?.currency ?? data?.assets?.[0]?.currency ?? "ZMW";
  const { groups, totals, holdingCount } = useMemo(() => {
    const holdings = buildPortfolioHoldings({
      assets: data?.assets ?? [],
      savingsPockets,
      savingsGroups,
      fallbackCurrency: reportingCurrency,
    });
    return {
      groups: groupPortfolioHoldings(holdings),
      totals: currencyTotals(holdings),
      holdingCount: holdings.filter((holding) => holding.hasPosition).length,
    };
  }, [data?.assets, reportingCurrency, savingsGroups, savingsPockets]);

  if (loading) {
    return (
      <PageShell>
        <LoadingSkeleton className="h-10" />
        <LoadingSkeleton className="h-36" />
        <LoadingSkeleton className="h-52" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", href: "/today" }, { label: "Portfolio" }]} />
      <PageHeader
        eyebrow="Portfolio"
        title="Investments"
        subtitle="Choose a dashboard to manage that investment type. Values in different currencies stay separate."
        actions={
          <Link href="/investments/add" className="btn btn-primary">
            Add investment
          </Link>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No investments yet"
          description="Add a stock, government bond, savings pocket, or savings group to start your portfolio."
          action={<Link href="/investments/add" className="btn btn-primary">Add investment</Link>}
        />
      ) : (
        <>
          <CompactSummary totals={totals} holdingCount={holdingCount} />
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Investment dashboards">
            {groups
              .filter((group) => group.kind in dashboardRoutes)
              .map((group) => (
                <DashboardCard key={group.kind} group={group} />
              ))}
          </section>
        </>
      )}
    </PageShell>
  );
}

function CompactSummary({ totals, holdingCount }: { totals: CurrencyTotal[]; holdingCount: number }) {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-4" aria-label="Portfolio summary">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Portfolio value</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {totals.length ? totals.map((total) => (
            <p key={total.currency} className="font-display text-2xl font-semibold tabular-nums text-on-surface sm:text-3xl">
              {formatMoney(total.currentValueMinor, total.currency)}
            </p>
          )) : <p className="text-on-surface-soft">No value recorded</p>}
        </div>
      </div>
      <p className="text-sm text-on-surface-soft">{holdingCount} active {holdingCount === 1 ? "holding" : "holdings"}</p>
    </section>
  );
}

function DashboardCard({ group }: { group: PortfolioGroup }) {
  const href = dashboardRoutes[group.kind as keyof typeof dashboardRoutes];
  const primary = group.totals[0];
  const difference = primary ? primary.currentValueMinor - primary.investedAmountMinor : 0;
  const percent = primary ? gainPercent(primary.currentValueMinor, primary.investedAmountMinor) : null;

  return (
    <Link href={href} className="card card-interactive flex min-h-44 flex-col justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-accent">{group.label}</p>
        <p className="mt-1 text-sm text-on-surface-soft">
          {group.trackedCount} active{group.pendingCount ? ` · ${group.pendingCount} waiting` : ""}
        </p>
      </div>
      <div className="mt-5">
        {group.totals.length ? group.totals.map((total) => (
          <p key={total.currency} className="font-display text-xl font-semibold tabular-nums text-on-surface">
            {formatMoney(total.currentValueMinor, total.currency)}
          </p>
        )) : <p className="text-sm text-on-surface-soft">No value recorded</p>}
        {primary && group.kind !== "savings_group" ? (
          <p className="mt-2 text-xs font-semibold">
            <Money amountMinor={difference} currency={primary.currency} signed tone="auto" />
            {percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}
          </p>
        ) : null}
        <p className="mt-4 text-sm font-semibold text-primary">Open dashboard →</p>
      </div>
    </Link>
  );
}
