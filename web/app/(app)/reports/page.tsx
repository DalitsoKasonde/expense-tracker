"use client";

import {
  AsyncErrorState,
  ChartCard,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { annualReportFilename, buildAnnualReportCsv } from "@/lib/report-export";
import {
  analyzeReportMonths,
  buildAxisTicks,
  buildTrendGeometry,
  cashCommitments,
  monthsInScope,
  peakSpendingMonth,
  percentageChange,
  wealthAllocation,
} from "@/lib/report-analysis";
import { useUserCurrency } from "@/lib/use-user-currency";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

type Bps = number | null | undefined;

type MonthlyInsight = {
  month: number;
  monthLabel: string;
  earnedIncome: number;
  borrowedIncome: number;
  totalInflow: number;
  livingExpenses: number;
  debtPrincipalPaid: number;
  debtInterestFees: number;
  savings: number;
  investments: number;
  operatingBalance: number;
  freeCashFlow: number;
  amountBroughtForward: number;
  endingCashBalance: number;
  netWorth: number;
  savingsRateBps?: Bps;
  debtBurdenRateBps?: Bps;
  interestLeakageBps?: Bps;
  borrowedDependencyBps?: Bps;
  wealthBuildRateBps?: Bps;
};

type AnnualOverall = {
  year: number;
  latestDataYear: number;
  availableYears: number[];
  rows: string[];
  data: MonthlyInsight[];
  ytd: MonthlyInsight;
};

type InsightSummary = {
  debtRemaining: number;
  alerts: string[];
};

type CategorySpendingNode = {
  id: string;
  parentId: string | null;
  name: string;
  /** This category plus every descendant. */
  total: number;
  /** This category's own transactions, excluding descendants. */
  direct: number;
  months: number[];
  children: CategorySpendingNode[];
};

type CategorySpending = {
  year: number;
  currency: string;
  total: number;
  months: number[];
  categories: CategorySpendingNode[];
};

type MoneyRow = {
  label: string;
  key: keyof MonthlyInsight;
  signed?: boolean;
};

const moneyRowGroups: Array<{ label: string; rows: MoneyRow[] }> = [
  {
    label: "Money in",
    rows: [
      { label: "Earned income", key: "earnedIncome" },
      { label: "Borrowed income", key: "borrowedIncome" },
      { label: "Total inflow", key: "totalInflow" },
    ],
  },
  {
    label: "Money committed",
    rows: [
      { label: "Living expenses", key: "livingExpenses" },
      { label: "Debt principal paid", key: "debtPrincipalPaid" },
      { label: "Debt interest and fees", key: "debtInterestFees" },
      { label: "Savings", key: "savings" },
      { label: "Investments", key: "investments" },
    ],
  },
  {
    label: "Cash position",
    rows: [
      { label: "Operating balance", key: "operatingBalance", signed: true },
      { label: "Free cash flow", key: "freeCashFlow", signed: true },
      { label: "Amount brought forward", key: "amountBroughtForward", signed: true },
      { label: "Ending cash balance", key: "endingCashBalance", signed: true },
      { label: "Net worth", key: "netWorth", signed: true },
    ],
  },
];

const rateRows: Array<{ label: string; key: keyof MonthlyInsight }> = [
  { label: "Savings rate", key: "savingsRateBps" },
  { label: "Debt burden rate", key: "debtBurdenRateBps" },
  { label: "Wealth build rate", key: "wealthBuildRateBps" },
];

function formatBps(value: Bps) {
  if (value === null || value === undefined) return "—";
  return `${(value / 100).toFixed(1)}%`;
}

function formatTableAmount(value: number) {
  if (value === 0) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function signedValueClass(value: number, signed = false) {
  if (!signed || value === 0) return "text-on-surface";
  return value > 0 ? "text-positive" : "text-negative";
}

function ytdValueForRow(annual: AnnualOverall, row: MoneyRow) {
  if (row.key === "amountBroughtForward") {
    return annual.data[0]?.amountBroughtForward ?? 0;
  }
  return Number(annual.ytd[row.key] ?? 0);
}

function barHeight(value: number, maximum: number) {
  return `${Math.max(0, value / maximum) * 100}%`;
}

function ReportsLoading() {
  return (
    <PageShell>
      <LoadingSkeleton className="h-24" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton className="h-36" />
        <LoadingSkeleton className="h-36" />
        <LoadingSkeleton className="h-36" />
        <LoadingSkeleton className="h-36" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <LoadingSkeleton className="h-96 lg:col-span-2" />
        <LoadingSkeleton className="h-96" />
      </div>
    </PageShell>
  );
}

export default function ReportsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { currency, loading: currencyLoading } = useUserCurrency();
  const [annual, setAnnual] = useState<AnnualOverall | null>(null);
  const [previousAnnual, setPreviousAnnual] = useState<AnnualOverall | null>(null);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [categorySpending, setCategorySpending] = useState<CategorySpending | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  // A ref, not state: this only guards the one-time jump to the latest year with
  // data. As state in the dependency list it re-triggered the effect and every
  // first page load fetched the whole report twice.
  const yearInitializedRef = useRef(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (sessionStatus === "loading" || currencyLoading) {
      return;
    }
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    let ignore = false;
    let jumpedToLatestYear = false;
    // The API aggregates per currency and defaults to ZMW. Without this the page
    // showed ZMW-only figures labelled with the user's preferred currency.
    const currencyParam = encodeURIComponent(currency);
    const annualPath = (year: number) =>
      `/v1/dashboard/annual?year=${year}&currency=${currencyParam}`;

    const loadReports = async () => {
      setLoading(true);
      try {
        const [annualResult, summaryResult, categoryResult] = await Promise.allSettled([
          apiCallRef.current<AnnualOverall>(annualPath(selectedYear)),
          apiCallRef.current<InsightSummary>(`/v1/dashboard/insights?currency=${currencyParam}`),
          apiCallRef.current<CategorySpending>(
            `/v1/dashboard/categories?year=${selectedYear}&currency=${currencyParam}`,
          ),
        ]);
        if (annualResult.status === "rejected") {
          throw annualResult.reason;
        }
        if (!ignore) {
          if (
            !yearInitializedRef.current &&
            annualResult.value.availableYears?.length &&
            annualResult.value.latestDataYear !== selectedYear
          ) {
            yearInitializedRef.current = true;
            jumpedToLatestYear = true;
            setSelectedYear(annualResult.value.latestDataYear);
            return;
          }
          const comparisonYear = annualResult.value.availableYears.find(
            (year) => year < annualResult.value.year,
          );
          let comparison: AnnualOverall | null = null;
          if (comparisonYear) {
            try {
              comparison = await apiCallRef.current<AnnualOverall>(annualPath(comparisonYear));
            } catch {
              comparison = null;
            }
          }
          if (ignore) return;
          yearInitializedRef.current = true;
          setAnnual(annualResult.value);
          setPreviousAnnual(comparison);
          setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : null);
          // The breakdown is one card, not the whole report, so a failure here
          // reports inside that card instead of blanking the page.
          setCategorySpending(
            categoryResult.status === "fulfilled" ? categoryResult.value : null,
          );
          setCategoryError(
            categoryResult.status === "fulfilled"
              ? ""
              : categoryResult.reason instanceof Error
                ? categoryResult.reason.message
                : "Something went wrong",
          );
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
        }
      } finally {
        // Stay in the loading state while the effect re-runs for the other year,
        // otherwise the page flashes an empty report in between.
        if (!ignore && !jumpedToLatestYear) setLoading(false);
      }
    };

    void loadReports();
    return () => {
      ignore = true;
    };
  }, [currency, currencyLoading, retryVersion, selectedYear, session?.accessToken, sessionStatus]);

  // Both charts plot the same months, so the bar chart no longer shows a tail of
  // empty future months while the trend chart stops at the current one.
  const chartMonths = useMemo(
    () => (annual ? monthsInScope(annual.data, annual.year) : []),
    [annual],
  );

  const reportAnalysis = useMemo(
    () => analyzeReportMonths(chartMonths),
    [chartMonths],
  );

  const chartSummary = annual
    ? `${annual.year} monthly cash movement. Total inflow is ${formatMoney(
        annual.ytd.totalInflow,
        currency,
      )}, cash commitments are ${formatMoney(
        cashCommitments(annual.ytd),
        currency,
      )}, and savings plus investments are ${formatMoney(
        wealthAllocation(annual.ytd),
        currency,
      )}.`
    : "Monthly cash movement is unavailable.";

  function exportAnnualReport() {
    if (!annual) return;
    const csv = buildAnnualReportCsv(annual, currency);
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = annualReportFilename(annual.year, currency);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loading || sessionStatus === "loading") return <ReportsLoading />;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reports"
        title="Financial report"
        subtitle="See where your money came from, where it went, and whether each month strengthened your position."
        actions={
          annual ? (
            <div className="flex flex-wrap items-end gap-3 print:hidden">
              <button className="btn btn-ghost" type="button" onClick={exportAnnualReport}>
                Export CSV
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => window.print()}>
                Print
              </button>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-on-surface-soft">
                Report year
                <select
                  className="control min-w-28 font-semibold"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {(annual.availableYears.length ? annual.availableYears : [selectedYear]).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null
        }
      />

      {error ? (
        <AsyncErrorState
          title="We couldn't load your reports"
          description="Your financial data is safe. Try loading this report again."
          retrying={loading}
          onRetry={() => {
            setError("");
            setRetryVersion((current) => current + 1);
          }}
        />
      ) : null}

      {annual && !error ? (
        <>
          <section aria-label={`${annual.year} summary`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total inflow"
              value={formatMoney(annual.ytd.totalInflow, currency)}
              detail={`${formatMoney(annual.ytd.earnedIncome, currency)} was earned`}
              tone="income"
            />
            <MetricCard
              label="Cash commitments"
              value={formatMoney(cashCommitments(annual.ytd), currency)}
              detail="Living costs, debt principal, interest and fees"
              tone="expense"
            />
            <MetricCard
              label="Free cash flow"
              value={formatMoney(annual.ytd.freeCashFlow, currency)}
              // Pairing a negative flow with a triple-digit "wealth build rate"
              // reads as a bug. The rate divides by earned income, so it says
              // nothing useful once spending has outrun what was earned.
              detail={
                annual.ytd.freeCashFlow < 0
                  ? `${formatMoney(
                      Math.abs(annual.ytd.freeCashFlow),
                      currency,
                    )} more went out than was earned`
                  : `${formatBps(annual.ytd.wealthBuildRateBps)} wealth build rate`
              }
              tone={annual.ytd.freeCashFlow >= 0 ? "savings" : "expense"}
            />
            <MetricCard
              label="Net worth"
              value={formatMoney(annual.ytd.netWorth, currency)}
              detail={`${formatMoney(annual.ytd.endingCashBalance, currency)} ending cash`}
              tone="investment"
            />
          </section>

          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard
                title="Monthly cash movement"
                subtitle="Compare money received, committed to costs and debt, and allocated to savings or investments."
                summary={chartSummary}
              >
                {reportAnalysis.activeMonthCount ? (
                  <>
                    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-on-surface-soft">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-sm bg-income" />
                        Inflow
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-sm bg-expense" />
                        Cash commitments
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-sm bg-investment" />
                        Savings and investments
                      </span>
                    </div>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex min-w-max gap-3">
                        {chartMonths.map((month) => {
                          const commitments = cashCommitments(month);
                          const allocation = wealthAllocation(month);
                          return (
                            <div
                              key={month.month}
                              className="grid w-14 shrink-0 gap-2 text-center"
                              title={`${month.monthLabel}: inflow ${formatMoney(
                                month.totalInflow,
                                currency,
                              )}, cash commitments ${formatMoney(
                                commitments,
                                currency,
                              )}, savings and investments ${formatMoney(allocation, currency)}`}
                            >
                              <div className="flex h-48 items-end justify-center gap-1 rounded-md border-b border-outline bg-surface-soft px-1 pt-3">
                                <span
                                  className={`w-2.5 rounded-t-sm bg-income ${month.totalInflow ? "min-h-1" : ""}`}
                                  style={{ height: barHeight(month.totalInflow, reportAnalysis.chartMaximum) }}
                                  title={`Inflow: ${formatMoney(month.totalInflow, currency)}`}
                                />
                                <span
                                  className={`w-2.5 rounded-t-sm bg-expense ${commitments ? "min-h-1" : ""}`}
                                  style={{ height: barHeight(commitments, reportAnalysis.chartMaximum) }}
                                  title={`Cash commitments: ${formatMoney(commitments, currency)}`}
                                />
                                <span
                                  className={`w-2.5 rounded-t-sm bg-investment ${allocation ? "min-h-1" : ""}`}
                                  style={{ height: barHeight(allocation, reportAnalysis.chartMaximum) }}
                                  title={`Savings and investments: ${formatMoney(allocation, currency)}`}
                                />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-on-surface">{month.monthLabel}</p>
                                <p
                                  className={`mt-0.5 text-xs tabular-nums ${signedValueClass(
                                    month.freeCashFlow,
                                    true,
                                  )}`}
                                  title={`Free cash flow: ${formatMoney(month.freeCashFlow, currency)}`}
                                >
                                  {month.freeCashFlow === 0
                                    ? "—"
                                    : formatMoney(month.freeCashFlow, currency, {
                                        notation: "compact",
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 1,
                                      })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-4 border-t border-outline pt-3 text-xs text-on-surface-soft">
                      The figure under each month is free cash flow after living costs and debt payments.
                    </p>
                  </>
                ) : (
                  <EmptyState
                    title="No cash movement in this year"
                    description="Add income, expenses, debt payments, savings, or investments to populate this chart."
                  />
                )}
              </ChartCard>
            </div>

            <section className="card">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Year highlights</p>
              <h2 className="mt-1 text-lg font-semibold text-on-surface">What stands out</h2>
              {reportAnalysis.activeMonthCount ? (
                <dl className="mt-5 divide-y divide-outline">
                  <div className="pb-4">
                    <dt className="text-xs font-semibold text-on-surface-soft">Best cash-flow month</dt>
                    {reportAnalysis.strongestMonth ? (
                      <dd className="mt-1 flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-on-surface">
                          {reportAnalysis.strongestMonth.monthLabel}
                        </span>
                        <span className="font-semibold tabular-nums text-positive">
                          {formatMoney(reportAnalysis.strongestMonth.freeCashFlow, currency)}
                        </span>
                      </dd>
                    ) : (
                      <dd className="mt-1 text-sm text-on-surface-soft">
                        No month finished ahead this year yet.
                      </dd>
                    )}
                  </div>
                  <div className="py-4">
                    <dt className="text-xs font-semibold text-on-surface-soft">Highest commitments</dt>
                    <dd className="mt-1 flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-on-surface">
                        {reportAnalysis.highestCommitmentMonth?.monthLabel}
                      </span>
                      <span className="font-semibold tabular-nums text-expense">
                        {formatMoney(
                          reportAnalysis.highestCommitmentMonth
                            ? cashCommitments(reportAnalysis.highestCommitmentMonth)
                            : 0,
                          currency,
                        )}
                      </span>
                    </dd>
                  </div>
                  <div className="py-4">
                    <dt className="text-xs font-semibold text-on-surface-soft">Average monthly free cash flow</dt>
                    <dd
                      className={`mt-1 font-semibold tabular-nums ${signedValueClass(
                        reportAnalysis.averageFreeCashFlow,
                        true,
                      )}`}
                    >
                      {formatMoney(reportAnalysis.averageFreeCashFlow, currency)}
                    </dd>
                    <p className="mt-1 text-xs text-on-surface-soft">
                      Across {reportAnalysis.activeMonthCount} active{" "}
                      {reportAnalysis.activeMonthCount === 1 ? "month" : "months"}
                    </p>
                  </div>
                  {selectedYear === currentYear && summary ? (
                    <div className="pt-4">
                      <dt className="text-xs font-semibold text-on-surface-soft">Debt still remaining</dt>
                      <dd className="mt-1 font-semibold tabular-nums text-on-surface">
                        {formatMoney(summary.debtRemaining, currency)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-on-surface-soft">
                  Highlights will appear once this year has recorded financial activity.
                </p>
              )}
            </section>
          </div>

          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <BalanceTrendChart annual={annual} currency={currency} />
            </div>
            <FinancialRatios annual={annual} />
          </div>

          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <div className={previousAnnual ? "" : "lg:col-span-2"}>
              <CashUseMix annual={annual} currency={currency} />
            </div>
            {previousAnnual ? (
              <YearComparison
                annual={annual}
                previousAnnual={previousAnnual}
                currency={currency}
              />
            ) : null}
          </div>

          <CategorySpendingCard
            spending={categorySpending}
            error={categoryError}
            year={annual.year}
            currency={currency}
            monthLabels={annual.data.map((month) => month.monthLabel)}
            onRetry={() => {
              setCategoryError("");
              setRetryVersion((current) => current + 1);
            }}
          />

          {selectedYear === currentYear && summary?.alerts?.length ? (
            <section className="rounded-lg border border-warning bg-warning-soft p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Needs attention</p>
              <ul className="mt-3 grid gap-2 text-sm font-medium text-on-surface sm:grid-cols-2">
                {summary.alerts.map((alert) => (
                  <li key={alert} className="flex gap-2">
                    <span className="text-warning" aria-hidden="true">•</span>
                    <span>{alert}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card card-flush overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-outline p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Annual detail</p>
                <h2 className="mt-1 text-lg font-semibold text-on-surface">Month-by-month matrix</h2>
                <p className="mt-1 text-sm text-on-surface-soft">
                  Amounts are shown in {currency}. Zero values are shown as an em dash.
                </p>
              </div>
              <span className="rounded-pill bg-primary-softer px-3 py-1 text-xs font-bold text-primary">
                {annual.year}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-sm">
                <caption className="sr-only">
                  {annual.year} monthly financial report with a year-to-date total
                </caption>
                <thead>
                  <tr className="border-b border-outline bg-surface-soft">
                    <th
                      scope="col"
                      className="sticky left-0 z-20 min-w-48 bg-surface-soft px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-soft"
                    >
                      Metric
                    </th>
                    {annual.data.map((month) => (
                      <th
                        key={month.month}
                        scope="col"
                        className="min-w-24 px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-on-surface-soft"
                      >
                        {month.monthLabel}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="min-w-28 bg-primary-softer px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-primary"
                    >
                      YTD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {moneyRowGroups.map((group) => (
                    <ReportMoneyGroup
                      key={group.label}
                      annual={annual}
                      group={group}
                    />
                  ))}
                  <tr className="border-y border-outline bg-surface-soft">
                    <th
                      colSpan={annual.data.length + 2}
                      className="sticky left-0 px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-on-surface-soft"
                    >
                      Ratios
                    </th>
                  </tr>
                  {rateRows.map((row) => (
                    <tr key={row.key} className="border-b border-outline last:border-0">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-surface px-5 py-3 text-left font-medium text-on-surface"
                      >
                        {row.label}
                      </th>
                      {annual.data.map((month) => (
                        <td
                          key={`${row.key}-${month.month}`}
                          className="px-3 py-3 text-right tabular-nums text-on-surface"
                        >
                          {formatBps(month[row.key] as Bps)}
                        </td>
                      ))}
                      <td className="bg-primary-softer px-4 py-3 text-right font-semibold tabular-nums text-primary">
                        {formatBps(annual.ytd[row.key] as Bps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function CategorySpendingCard({
  spending,
  error,
  year,
  currency,
  monthLabels,
  onRetry,
}: {
  spending: CategorySpending | null;
  error: string;
  year: number;
  currency: string;
  monthLabels: string[];
  onRetry: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const categories = spending?.categories ?? [];
  const total = spending?.total ?? 0;

  function toggle(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <section className="card">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
        Spending detail
      </p>
      <h2 className="mt-1 text-lg font-semibold text-on-surface">Where the money went</h2>
      <p className="mt-1 text-sm text-on-surface-soft">
        {year} living expenses grouped by category. Debt payments, savings, and investments
        are counted elsewhere in this report, so this total matches the living expenses row.
      </p>

      {error ? (
        <div className="mt-5" role="alert">
          <p className="text-sm text-negative">
            We couldn&apos;t load your category breakdown. {error}
          </p>
          <button className="btn btn-ghost mt-3" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : total > 0 ? (
        <>
          <p className="sr-only">
            {`${year} living expenses total ${formatMoney(total, currency)}. ${categories
              .map(
                (category) =>
                  `${category.name} ${formatMoney(category.total, currency)}, ${(
                    (category.total / total) *
                    100
                  ).toFixed(1)} percent`,
              )
              .join(". ")}.`}
          </p>
          <p className="mt-5 text-sm text-on-surface-soft">
            <span className="font-semibold tabular-nums text-on-surface">
              {formatMoney(total, currency)}
            </span>{" "}
            across {categories.length} {categories.length === 1 ? "category" : "categories"}
          </p>
          <ul className="mt-4 grid gap-4">
            {categories.map((category) => (
              <CategorySpendingRow
                key={category.id}
                node={category}
                total={total}
                currency={currency}
                monthLabels={monthLabels}
                depth={0}
                expandedIds={expandedIds}
                onToggle={toggle}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="No categorised spending this year"
            description="Give your expenses a category when you record them to see this breakdown."
          />
        </div>
      )}
    </section>
  );
}

function CategorySpendingRow({
  node,
  total,
  currency,
  monthLabels,
  depth,
  expandedIds,
  onToggle,
}: {
  node: CategorySpendingNode;
  total: number;
  currency: string;
  monthLabels: string[];
  depth: number;
  expandedIds: string[];
  onToggle: (id: string) => void;
}) {
  const share = total === 0 ? 0 : (node.total / total) * 100;
  const peak = peakSpendingMonth(node.months);
  const expandable = node.children.length > 0;
  const expanded = expandable && expandedIds.includes(node.id);
  const childrenId = `category-children-${node.id}`;
  // Bars are always a share of the report total, never of the parent, so a
  // subcategory's bar means the same thing as a top-level one.
  const bar = (
    <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-soft">
      <div className="h-full rounded-pill bg-expense" style={{ width: `${share}%` }} />
    </div>
  );
  const heading = (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${depth === 0 ? "font-semibold" : ""} text-on-surface`}>
        {node.name}
      </span>
      <span className="shrink-0 text-right">
        <span className="font-semibold tabular-nums text-on-surface">
          {formatMoney(node.total, currency)}
        </span>
        <span className="ml-2 text-xs tabular-nums text-on-surface-soft">
          {share.toFixed(1)}%
        </span>
      </span>
    </div>
  );

  return (
    <li className={depth === 0 ? "" : "ml-4"}>
      {expandable ? (
        <button
          type="button"
          className="flex min-h-11 w-full flex-col justify-center rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-expanded={expanded}
          aria-controls={childrenId}
          onClick={() => onToggle(node.id)}
        >
          <span className="flex w-full items-baseline gap-2">
            <span aria-hidden="true" className="text-xs text-on-surface-soft">
              {expanded ? "▾" : "▸"}
            </span>
            <span className="min-w-0 flex-1">{heading}</span>
          </span>
          <span className="w-full pl-5">{bar}</span>
        </button>
      ) : (
        <div className={depth === 0 ? "" : "pl-5"}>
          {heading}
          {bar}
        </div>
      )}
      {/* Indented to clear the disclosure arrow, except on a top-level row that
          has no arrow to clear. */}
      <p className={`mt-1 text-xs text-on-surface-soft ${depth === 0 && !expandable ? "" : "pl-5"}`}>
        {peak
          ? `Peak in ${monthLabels[peak.index] ?? `month ${peak.index + 1}`} · ${formatMoney(
              peak.amount,
              currency,
            )}`
          : "No spending recorded"}
        {expandable
          ? ` · ${node.children.length} ${node.children.length === 1 ? "subcategory" : "subcategories"}`
          : ""}
      </p>
      {expandable && expanded ? (
        <ul id={childrenId} className="mt-4 grid gap-4 border-l border-outline pl-1">
          {node.direct > 0 ? (
            <li className="ml-4 pl-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-on-surface-soft">
                  Recorded directly on {node.name}
                </span>
                <span className="font-semibold tabular-nums text-on-surface">
                  {formatMoney(node.direct, currency)}
                </span>
              </div>
            </li>
          ) : null}
          {node.children.map((child) => (
            <CategorySpendingRow
              key={child.id}
              node={child}
              total={total}
              currency={currency}
              monthLabels={monthLabels}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function BalanceTrendChart({
  annual,
  currency,
}: {
  annual: AnnualOverall;
  currency: string;
}) {
  const months = monthsInScope(annual.data, annual.year);
  const netWorthValues = months.map((month) => month.netWorth);
  const cashValues = months.map((month) => month.endingCashBalance);
  const allValues = [...netWorthValues, ...cashValues];
  const hasBalance = allValues.some((value) => value !== 0);
  const domain = {
    minimum: Math.min(0, ...allValues),
    maximum: Math.max(0, ...allValues),
  };
  const netWorthGeometry = buildTrendGeometry(netWorthValues, 600, 180, 16, domain);
  const cashGeometry = buildTrendGeometry(cashValues, 600, 180, 16, domain);
  const ticks = buildAxisTicks(domain, 180, 16);
  const latestMonth = months.at(-1);
  const pointList = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => `${point.x},${point.y}`).join(" ");
  const compact = {
    notation: "compact" as const,
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  };

  return (
    <ChartCard
      title="Balance and net-worth trend"
      subtitle="Track liquid cash against your broader financial position through the year."
      summary={`${annual.year} balance trend. Latest cash balance is ${formatMoney(
        latestMonth?.endingCashBalance ?? 0,
        currency,
      )}, and latest net worth is ${formatMoney(latestMonth?.netWorth ?? 0, currency)}.`}
    >
      {hasBalance ? (
        <>
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-on-surface-soft">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 bg-investment" />
              Net worth
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 bg-primary" />
              Cash balance
            </span>
          </div>
          {/* The axis labels sit outside the SVG so they keep a fixed type size
              instead of scaling with the viewBox. The tick column must span the
              plot and nothing else, so the month labels live below the row and
              are indented by the tick column width plus the gap. */}
          <div className="flex gap-2">
            <div className="relative w-16 shrink-0">
              {ticks.map((tick) => (
                <span
                  key={tick.value}
                  className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-on-surface-soft"
                  style={{ top: `${(tick.y / 180) * 100}%` }}
                >
                  {formatMoney(tick.value, currency, compact)}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <svg viewBox="0 0 600 180" className="w-full">
                <title>{annual.year} cash balance and net-worth trend</title>
                <desc>
                  Net worth and ending cash balance plotted for each available month.
                </desc>
                {ticks.map((tick) => (
                  <line
                    key={tick.value}
                    x1="16"
                    x2="584"
                    y1={tick.y}
                    y2={tick.y}
                    className={tick.value === 0 ? "stroke-outline-strong" : "stroke-outline"}
                    strokeDasharray={tick.value === 0 ? undefined : "4 4"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <polyline
                  points={pointList(netWorthGeometry.points)}
                  className="fill-none stroke-investment stroke-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={pointList(cashGeometry.points)}
                  className="fill-none stroke-primary stroke-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {netWorthGeometry.points.map((point, index) => (
                  <circle
                    key={`net-worth-${months[index]?.month}`}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    className="fill-investment"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {cashGeometry.points.map((point, index) => (
                  <circle
                    key={`cash-${months[index]?.month}`}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    className="fill-primary"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>
          </div>
          {/* 4.5rem = the w-16 tick column plus the gap-2 between columns, so a
              label lands under the point it belongs to. */}
          <div className="relative ml-[4.5rem] mt-1 h-4">
            {months.map((month, index) => (
              <span
                key={month.month}
                className="absolute -translate-x-1/2 text-xs font-semibold text-on-surface-soft"
                style={{
                  left: `${((netWorthGeometry.points[index]?.x ?? 0) / 600) * 100}%`,
                }}
              >
                {month.monthLabel}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-outline pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-on-surface-soft">Latest net worth</p>
              <p className="mt-1 font-semibold tabular-nums text-on-surface">
                {formatMoney(latestMonth?.netWorth ?? 0, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-on-surface-soft">Latest cash balance</p>
              <p className="mt-1 font-semibold tabular-nums text-on-surface">
                {formatMoney(latestMonth?.endingCashBalance ?? 0, currency)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No balance history yet"
          description="Account balances and investments will create a net-worth trend here."
        />
      )}
    </ChartCard>
  );
}

function FinancialRatios({ annual }: { annual: AnnualOverall }) {
  const ratios = [
    {
      label: "Savings rate",
      value: annual.ytd.savingsRateBps,
      detail: "Savings and investments ÷ earned income",
      color: "bg-savings",
    },
    {
      label: "Wealth build rate",
      value: annual.ytd.wealthBuildRateBps,
      detail: "Savings, investments and debt principal ÷ earned income",
      color: "bg-investment",
    },
    {
      label: "Debt burden",
      value: annual.ytd.debtBurdenRateBps,
      detail: "Debt principal, interest and fees ÷ earned income",
      color: "bg-expense",
    },
    {
      label: "Interest leakage",
      value: annual.ytd.interestLeakageBps,
      detail: "Interest and fees ÷ earned income",
      color: "bg-warning",
    },
    {
      label: "Borrowed dependency",
      value: annual.ytd.borrowedDependencyBps,
      detail: "Borrowed money ÷ total inflow",
      color: "bg-primary",
    },
  ];

  return (
    <section className="card">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
        Financial ratios
      </p>
      <h2 className="mt-1 text-lg font-semibold text-on-surface">Income efficiency</h2>
      <p className="mt-1 text-sm text-on-surface-soft">
        Each measure uses earned income as its base unless noted.
      </p>
      <p className="sr-only">
        {ratios
          .map((ratio) => `${ratio.label}: ${formatBps(ratio.value)}`)
          .join(". ")}
      </p>
      <dl className="mt-5 grid gap-5">
        {ratios.map((ratio) => {
          const percentage =
            ratio.value === null || ratio.value === undefined ? null : ratio.value / 100;
          const width = percentage === null ? 0 : Math.min(100, Math.max(0, percentage));
          // A ratio can exceed 100% (spending more on debt than you earn). The
          // bar caps, so say so rather than showing a full bar as if it were
          // exactly 100%.
          const overScale = percentage !== null && percentage > 100;
          return (
            <div key={ratio.label}>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm font-semibold text-on-surface">{ratio.label}</dt>
                <dd className="font-semibold tabular-nums text-on-surface">
                  {formatBps(ratio.value)}
                </dd>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-soft">
                <div
                  className={`h-full rounded-pill ${ratio.color}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-on-surface-soft">
                {ratio.detail}
                {overScale ? " · above 100%, bar capped" : ""}
              </p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function CashUseMix({
  annual,
  currency,
}: {
  annual: AnnualOverall;
  currency: string;
}) {
  const items = [
    {
      label: "Living expenses",
      value: Math.max(0, annual.ytd.livingExpenses),
      color: "bg-expense",
    },
    {
      label: "Debt principal",
      value: Math.max(0, annual.ytd.debtPrincipalPaid),
      color: "bg-primary",
    },
    {
      label: "Interest and fees",
      value: Math.max(0, annual.ytd.debtInterestFees),
      color: "bg-warning",
    },
    {
      label: "Savings",
      value: Math.max(0, annual.ytd.savings),
      color: "bg-savings",
    },
    {
      label: "Investments",
      value: Math.max(0, annual.ytd.investments),
      color: "bg-investment",
    },
  ].filter((item) => item.value > 0);
  const totalUses = items.reduce((total, item) => total + item.value, 0);
  const fundingDifference = annual.ytd.totalInflow - totalUses;
  const summary = `${annual.year} cash uses total ${formatMoney(
    totalUses,
    currency,
  )}. ${items
    .map(
      (item) =>
        `${item.label} ${formatMoney(item.value, currency)}, ${(
          (item.value / Math.max(1, totalUses)) *
          100
        ).toFixed(1)} percent`,
    )
    .join(". ")}.`;

  return (
    <ChartCard
      title="Cash-use mix"
      subtitle="See how all committed cash was divided across living costs, debt, savings, and investments."
      summary={summary}
    >
      {totalUses ? (
        <>
          <div className="flex h-9 overflow-hidden rounded-md bg-surface-soft">
            {items.map((item) => (
              <span
                key={item.label}
                className={item.color}
                style={{ width: `${(item.value / totalUses) * 100}%` }}
              />
            ))}
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-sm text-on-surface-soft">
                  <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${item.color}`} />
                  {item.label}
                </dt>
                <dd className="text-right">
                  <p className="font-semibold tabular-nums text-on-surface">
                    {formatMoney(item.value, currency)}
                  </p>
                  <p className="text-xs tabular-nums text-on-surface-soft">
                    {((item.value / totalUses) * 100).toFixed(1)}%
                  </p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-outline pt-4 text-sm text-on-surface-soft">
            {fundingDifference >= 0
              ? `${formatMoney(fundingDifference, currency)} of total inflow remained after these uses.`
              : `${formatMoney(
                  Math.abs(fundingDifference),
                  currency,
                )} beyond this year's inflow was funded from existing cash.`}
          </p>
        </>
      ) : (
        <EmptyState
          title="No cash uses recorded"
          description="Expenses, debt payments, savings, and investments will build this allocation."
        />
      )}
    </ChartCard>
  );
}

function YearComparison({
  annual,
  previousAnnual,
  currency,
}: {
  annual: AnnualOverall;
  previousAnnual: AnnualOverall;
  currency: string;
}) {
  const rows = [
    {
      label: "Total inflow",
      current: annual.ytd.totalInflow,
      previous: previousAnnual.ytd.totalInflow,
      higherIsBetter: true,
    },
    {
      label: "Cash commitments",
      current: cashCommitments(annual.ytd),
      previous: cashCommitments(previousAnnual.ytd),
      higherIsBetter: false,
    },
    {
      label: "Free cash flow",
      current: annual.ytd.freeCashFlow,
      previous: previousAnnual.ytd.freeCashFlow,
      higherIsBetter: true,
    },
    {
      label: "Savings and investments",
      current: wealthAllocation(annual.ytd),
      previous: wealthAllocation(previousAnnual.ytd),
      higherIsBetter: true,
    },
    {
      label: "Net worth",
      current: annual.ytd.netWorth,
      previous: previousAnnual.ytd.netWorth,
      higherIsBetter: true,
    },
  ];

  return (
    <section className="card card-flush overflow-hidden">
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">
          Year comparison
        </p>
        <h2 className="mt-1 text-lg font-semibold text-on-surface">
          {annual.year} vs {previousAnnual.year}
        </h2>
        <p className="mt-1 text-sm text-on-surface-soft">
          Compare the same annual measures with your most recent earlier data year.
        </p>
      </div>
      <div className="overflow-x-auto border-t border-outline">
        <table className="dataTable">
          <caption className="sr-only">
            Financial comparison between {annual.year} and {previousAnnual.year}
          </caption>
          <thead className="bg-surface-soft text-xs uppercase tracking-wider text-on-surface-soft">
            <tr>
              <th>Metric</th>
              <th className="numeric">{previousAnnual.year}</th>
              <th className="numeric">{annual.year}</th>
              <th className="numeric">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const difference = row.current - row.previous;
              const percentage = percentageChange(row.current, row.previous);
              const favorable =
                difference === 0
                  ? null
                  : row.higherIsBetter
                    ? difference > 0
                    : difference < 0;
              const tone =
                favorable === null
                  ? "text-on-surface"
                  : favorable
                    ? "text-positive"
                    : "text-negative";
              return (
                <tr key={row.label}>
                  <th scope="row" className="font-medium text-on-surface">
                    {row.label}
                  </th>
                  <td data-label={String(previousAnnual.year)} className="numeric text-on-surface">
                    {formatMoney(row.previous, currency)}
                  </td>
                  <td data-label={String(annual.year)} className="numeric font-semibold text-on-surface">
                    {formatMoney(row.current, currency)}
                  </td>
                  <td data-label="Change" className={`numeric font-semibold ${tone}`}>
                    {difference > 0 ? "+" : ""}
                    {formatMoney(difference, currency)}
                    {percentage === null ? null : (
                      <span className="ml-1 text-xs">
                        ({percentage > 0 ? "+" : ""}
                        {percentage.toFixed(1)}%)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportMoneyGroup({
  annual,
  group,
}: {
  annual: AnnualOverall;
  group: { label: string; rows: MoneyRow[] };
}) {
  return (
    <>
      <tr className="border-y border-outline bg-surface-soft first:border-t-0">
        <th
          colSpan={annual.data.length + 2}
          className="sticky left-0 px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-on-surface-soft"
        >
          {group.label}
        </th>
      </tr>
      {group.rows.map((row) => {
        const ytdValue = ytdValueForRow(annual, row);
        return (
          <tr key={row.key} className="border-b border-outline">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-surface px-5 py-3 text-left font-medium text-on-surface"
            >
              {row.label}
            </th>
            {annual.data.map((month) => {
              const value = Number(month[row.key] ?? 0);
              return (
                <td
                  key={`${row.key}-${month.month}`}
                  className={`px-3 py-3 text-right tabular-nums ${signedValueClass(
                    value,
                    row.signed,
                  )}`}
                >
                  {formatTableAmount(value)}
                </td>
              );
            })}
            <td
              className={`bg-primary-softer px-4 py-3 text-right font-semibold tabular-nums ${signedValueClass(
                ytdValue,
                row.signed,
              )}`}
            >
              {formatTableAmount(ytdValue)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
