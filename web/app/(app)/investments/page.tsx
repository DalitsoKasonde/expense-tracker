"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, Money, PageHeader, PageShell, SummaryMetric } from "@/components/ui";
import { InvestingHabitCard } from "@/components/investments/investing-habit-card";
import { PortfolioHighlightsCard } from "@/components/investments/portfolio-highlights";
import { useApiCall } from "@/lib/client-api";
import { useEntriesChanged } from "@/lib/entries-bus";
import { formatMoney } from "@/lib/format-money";
import { habitFor } from "@/lib/investing-habit";
import {
  buildPortfolioHoldings,
  currencyTotals,
  groupPortfolioHoldings,
  type PortfolioGroup,
  type PortfolioHolding,
  type PortfolioHoldingKind,
} from "@/lib/portfolio-holdings";
import { indexActivity, portfolioHighlights, portfolioReturn, type CategoryFigure, type PortfolioReturn } from "@/lib/portfolio-insights";
import { useInvestmentActivity } from "@/lib/use-investment-activity";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { useUserCurrency } from "@/lib/use-user-currency";

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

/** Only the fields the overview reads from /v1/bonds/summary. */
type BondCurrencySummary = {
  currency: string;
  nextCouponDate?: string;
  nextCouponNetMinor: number;
};

const dashboardRoutes = {
  stock: "/investments/stocks",
  bond: "/investments/bonds",
  savings_pocket: "/investments/savings-pockets",
  savings_group: "/investments/savings-groups",
} as const;

/** What each kind's income is called, so the breakdown reads as plain words. */
const incomeNames: Record<PortfolioHoldingKind, string> = {
  stock: "dividends",
  bond: "coupons",
  savings_pocket: "interest",
  savings_group: "share-outs",
  cash_equivalent: "income",
  other: "income",
};

function signedPercent(percent: number | null) {
  return percent === null ? "" : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export default function InvestmentsPage() {
  const apiCall = useApiCall();
  const { data, loading, reload } = useUnifiedDashboard();
  const { activity, failed: activityFailed, setTargets, reload: reloadActivity } = useInvestmentActivity();
  const { currency: userCurrency } = useUserCurrency();
  const [savingsGroups, setSavingsGroups] = useState<SavingsGroup[]>([]);
  const [savingsPockets, setSavingsPockets] = useState<SavingsPocket[]>([]);
  const [bondSummaries, setBondSummaries] = useState<BondCurrencySummary[]>([]);
  // Bumping this re-runs the fetch effect below so a newly saved investment
  // entry shows up without a manual reload.
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      apiCall<SavingsGroup[]>("/v1/savings-groups").catch(() => []),
      apiCall<SavingsPocket[]>("/v1/savings-pockets").catch(() => []),
      // Only the next coupon comes from here; without it that one line is
      // simply left out.
      apiCall<BondCurrencySummary[]>("/v1/bonds/summary").catch(() => []),
    ])
      .then(([groups, pockets, bonds]) => {
        if (!ignore) {
          setSavingsGroups(groups ?? []);
          setSavingsPockets(pockets ?? []);
          setBondSummaries(Array.isArray(bonds) ? bonds : []);
        }
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [apiCall, reloadNonce]);

  useEntriesChanged(() => {
    reload();
    reloadActivity();
    setReloadNonce((nonce) => nonce + 1);
  });

  const reportingCurrency = data?.currency ?? data?.assets?.[0]?.currency ?? "ZMW";
  const { holdings, groups, totals } = useMemo(() => {
    const built = buildPortfolioHoldings({
      assets: data?.assets ?? [],
      savingsPockets,
      savingsGroups,
      fallbackCurrency: reportingCurrency,
    });
    return { holdings: built, groups: groupPortfolioHoldings(built), totals: currencyTotals(built) };
  }, [data?.assets, reportingCurrency, savingsGroups, savingsPockets]);

  const activityIndex = useMemo(() => indexActivity(activity?.holdings), [activity?.holdings]);
  const returns = useMemo(
    () =>
      new Map(
        totals.map((total) => [
          total.currency,
          portfolioReturn(holdings.filter((holding) => holding.currency === total.currency), activityIndex),
        ]),
      ),
    [activityIndex, holdings, totals],
  );

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
          {totals.map((total) => {
            const currencyHoldings = holdings.filter((holding) => holding.currency === total.currency);
            const result = returns.get(total.currency) as PortfolioReturn;
            const habit = habitFor(activity, "all", total.currency, userCurrency);
            const bondSummary = bondSummaries.find((summary) => summary.currency === total.currency);
            const highlights = portfolioHighlights(currencyHoldings, result, {
              date: bondSummary?.nextCouponDate,
              amountMinor: bondSummary?.nextCouponNetMinor ?? 0,
            });
            return (
              <div key={total.currency} className="grid gap-4">
                <PortfolioSummary
                  currency={total.currency}
                  holdings={currencyHoldings}
                  result={result}
                  incomeReady={activity !== null}
                  incomeFailed={activityFailed}
                  monthsInvesting={habit?.monthsInvesting ?? 0}
                  averagePerMonthMinor={habit?.averagePerMonthMinor ?? 0}
                />
                {habit ? (
                  <InvestingHabitCard scope="all" habit={habit} currency={total.currency} onTargetsChanged={setTargets} />
                ) : null}
                {/* Income-based lines would be wrong without the record, so
                    the card waits for it. */}
                {activity ? <PortfolioHighlightsCard highlights={highlights} currency={total.currency} /> : null}
              </div>
            );
          })}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Investment dashboards">
            {groups
              .filter((group) => group.kind in dashboardRoutes)
              .map((group) => (
                <DashboardCard
                  key={group.kind}
                  group={group}
                  figure={returns.get(group.totals[0]?.currency ?? "")?.categories.find((category) => category.kind === group.kind)}
                  incomeReady={activity !== null}
                />
              ))}
          </section>
        </>
      )}
    </PageShell>
  );
}

function PortfolioSummary({
  currency,
  holdings,
  result,
  incomeReady,
  incomeFailed,
  monthsInvesting,
  averagePerMonthMinor,
}: {
  currency: string;
  holdings: PortfolioHolding[];
  result: PortfolioReturn;
  incomeReady: boolean;
  incomeFailed: boolean;
  monthsInvesting: number;
  averagePerMonthMinor: number;
}) {
  const active = holdings.filter((holding) => holding.hasPosition).length;
  const kinds = result.categories.length;
  const earning = result.categories.filter((category) => category.incomeMinor !== 0);

  return (
    <section className="card" aria-label={`${currency} portfolio summary`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Portfolio value"
          value={formatMoney(result.valueMinor, currency)}
          detail={`${active} active ${active === 1 ? "holding" : "holdings"}${kinds > 1 ? ` across ${kinds} kinds` : ""}`}
        />
        <SummaryMetric
          label="Invested"
          value={formatMoney(result.investedMinor, currency)}
          detail={
            monthsInvesting > 0
              ? `over ${monthsInvesting} ${monthsInvesting === 1 ? "month" : "months"} · about ${formatMoney(averagePerMonthMinor, currency)} a month`
              : undefined
          }
        />
        {/* What every kind of holding has earned, each in its own terms: a
            stock's price and dividends, a bond's coupons, a pocket's interest.
            Value less cost alone would show a bond as earning nothing. */}
        {incomeFailed ? (
          <SummaryMetric label="Total return" value="—" detail="Income could not be loaded. Reload to try again." />
        ) : !incomeReady ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Total return</p>
            <LoadingSkeleton className="mt-2 h-8" />
          </div>
        ) : (
          <SummaryMetric
            label="Total return"
            value={<Money amountMinor={result.returnMinor} currency={currency} signed tone="auto" />}
            detail={
              <>
                {result.percent === null ? "" : `${signedPercent(result.percent)} · `}
                price <Money amountMinor={result.priceMinor} currency={currency} signed />
                {" · "}income <Money amountMinor={result.incomeMinor} currency={currency} signed />
              </>
            }
          />
        )}
        {incomeReady ? (
          <SummaryMetric
            label="Income received"
            value={<Money amountMinor={result.incomeMinor} currency={currency} signed tone={result.incomeMinor > 0 ? "positive" : "neutral"} />}
            detail={
              earning.length
                ? earning.map((category, index) => (
                    <span key={category.kind}>
                      {index ? " · " : ""}
                      {incomeNames[category.kind]} <Money amountMinor={category.incomeMinor} currency={currency} />
                    </span>
                  ))
                : "Nothing paid out yet"
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function DashboardCard({ group, figure, incomeReady }: { group: PortfolioGroup; figure?: CategoryFigure; incomeReady: boolean }) {
  const href = dashboardRoutes[group.kind as keyof typeof dashboardRoutes];

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
        {/* A group's result only exists at share-out, and a bond's value less
            cost is always zero, so each card shows its own kind of return. */}
        {figure && incomeReady && (group.kind !== "savings_group" || figure.returnMinor !== 0) ? (
          <p className="mt-2 text-xs font-semibold">
            <Money amountMinor={figure.returnMinor} currency={group.totals[0].currency} signed tone="auto" />
            {figure.returnPercent === null ? "" : ` (${signedPercent(figure.returnPercent)})`}
            <span className="font-normal text-on-surface-soft">
              {" "}
              {group.kind === "stock" ? "with dividends" : group.kind === "bond" ? "in coupons" : group.kind === "savings_pocket" ? "in interest" : "at share-out"}
            </span>
          </p>
        ) : null}
        <p className="mt-4 text-sm font-semibold text-primary">Open dashboard →</p>
      </div>
    </Link>
  );
}
