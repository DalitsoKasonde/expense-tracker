"use client";

import {
  AsyncErrorState,
  ChartCard,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
} from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { annualReportFilename, buildAnnualReportCsv } from "@/lib/report-export";
import {
  analyzeReportMonths,
  buildTrendGeometry,
  cashCommitments,
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
    <main className="mx-auto grid min-h-screen max-w-app gap-6 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
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
    </main>
  );
}

export default function ReportsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { currency } = useUserCurrency();
  const [annual, setAnnual] = useState<AnnualOverall | null>(null);
  const [previousAnnual, setPreviousAnnual] = useState<AnnualOverall | null>(null);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInitialized, setYearInitialized] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    let ignore = false;
    const loadReports = async () => {
      setLoading(true);
      try {
        const [annualResult, summaryResult] = await Promise.allSettled([
          apiCallRef.current<AnnualOverall>(`/v1/dashboard/annual?year=${selectedYear}`),
          apiCallRef.current<InsightSummary>("/v1/dashboard/insights"),
        ]);
        if (annualResult.status === "rejected") {
          throw annualResult.reason;
        }
        if (!ignore) {
          if (
            !yearInitialized &&
            annualResult.value.availableYears?.length &&
            annualResult.value.latestDataYear !== selectedYear
          ) {
            setSelectedYear(annualResult.value.latestDataYear);
            setYearInitialized(true);
            return;
          }
          const comparisonYear = annualResult.value.availableYears.find(
            (year) => year < annualResult.value.year,
          );
          let comparison: AnnualOverall | null = null;
          if (comparisonYear) {
            try {
              comparison = await apiCallRef.current<AnnualOverall>(
                `/v1/dashboard/annual?year=${comparisonYear}`,
              );
            } catch {
              comparison = null;
            }
          }
          if (ignore) return;
          setAnnual(annualResult.value);
          setPreviousAnnual(comparison);
          setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : null);
          setError("");
          setYearInitialized(true);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void loadReports();
    return () => {
      ignore = true;
    };
  }, [retryVersion, selectedYear, session?.accessToken, sessionStatus, yearInitialized]);

  const reportAnalysis = useMemo(
    () => analyzeReportMonths(annual?.data ?? []),
    [annual?.data],
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
    <main className="mx-auto grid min-h-screen max-w-app content-start gap-8 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        eyebrow="Reports"
        title="Financial report"
        subtitle="See where your money came from, where it went, and whether each month strengthened your position."
        actions={
          annual ? (
            <div className="flex flex-wrap items-end gap-3">
              <button className="ghostButton" type="button" onClick={exportAnnualReport}>
                Export CSV
              </button>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-on-surface-soft">
                Report year
                <select
                  className="min-w-28 rounded-md border border-outline bg-surface px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
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
              detail={`${formatBps(annual.ytd.wealthBuildRateBps)} wealth build rate`}
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
                        {annual.data.map((month) => {
                          const commitments = cashCommitments(month);
                          const allocation = wealthAllocation(month);
                          return (
                            <div key={month.month} className="grid w-14 shrink-0 gap-2 text-center">
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

            <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Year highlights</p>
              <h2 className="mt-1 text-lg font-semibold text-on-surface">What stands out</h2>
              {reportAnalysis.activeMonthCount ? (
                <dl className="mt-5 divide-y divide-outline">
                  <div className="pb-4">
                    <dt className="text-xs font-semibold text-on-surface-soft">Best cash-flow month</dt>
                    <dd className="mt-1 flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-on-surface">
                        {reportAnalysis.strongestMonth?.monthLabel}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${signedValueClass(
                          reportAnalysis.strongestMonth?.freeCashFlow ?? 0,
                          true,
                        )}`}
                      >
                        {formatMoney(reportAnalysis.strongestMonth?.freeCashFlow ?? 0, currency)}
                      </span>
                    </dd>
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
              <BalanceTrendChart
                annual={annual}
                currency={currency}
                currentYear={currentYear}
              />
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

          <section className="overflow-hidden rounded-lg border border-outline bg-surface shadow-sm">
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
    </main>
  );
}

function BalanceTrendChart({
  annual,
  currency,
  currentYear,
}: {
  annual: AnnualOverall;
  currency: string;
  currentYear: number;
}) {
  const currentMonth = new Date().getMonth() + 1;
  const months =
    annual.year === currentYear ? annual.data.slice(0, currentMonth) : annual.data;
  const netWorthValues = months.map((month) => month.netWorth);
  const cashValues = months.map((month) => month.endingCashBalance);
  const allValues = [...netWorthValues, ...cashValues];
  const hasBalance = allValues.some((value) => value !== 0);
  const domain = {
    minimum: Math.min(0, ...allValues),
    maximum: Math.max(0, ...allValues),
  };
  const netWorthGeometry = buildTrendGeometry(
    netWorthValues,
    600,
    180,
    16,
    domain,
  );
  const cashGeometry = buildTrendGeometry(cashValues, 600, 180, 16, domain);
  const latestMonth = months.at(-1);
  const pointList = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => `${point.x},${point.y}`).join(" ");

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
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-on-surface-soft">
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-5 bg-investment" />
                Net worth
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-5 bg-primary" />
                Cash balance
              </span>
            </div>
            <p className="text-right text-xs text-on-surface-soft">
              Range{" "}
              {formatMoney(domain.minimum, currency, {
                notation: "compact",
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              })}{" "}
              to{" "}
              {formatMoney(domain.maximum, currency, {
                notation: "compact",
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              })}
            </p>
          </div>
          <svg
            viewBox="0 0 600 180"
            className="w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <title>{annual.year} cash balance and net-worth trend</title>
            <desc>
              Net worth and ending cash balance plotted for each available month.
            </desc>
            {[16, 90, 164].map((position) => (
              <line
                key={position}
                x1="16"
                x2="584"
                y1={position}
                y2={position}
                className="stroke-outline"
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
          <div className="mt-2 flex justify-between gap-2 text-xs font-semibold text-on-surface-soft">
            {months.map((month) => (
              <span key={month.month}>{month.monthLabel}</span>
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
    <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm">
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
          const width =
            ratio.value === null || ratio.value === undefined
              ? 0
              : Math.min(100, Math.max(0, ratio.value / 100));
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
              <p className="mt-1 text-xs text-on-surface-soft">{ratio.detail}</p>
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
    <section className="overflow-hidden rounded-lg border border-outline bg-surface shadow-sm">
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
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">
            Financial comparison between {annual.year} and {previousAnnual.year}
          </caption>
          <thead className="bg-surface-soft text-xs uppercase tracking-wider text-on-surface-soft">
            <tr>
              <th className="px-5 py-3 text-left">Metric</th>
              <th className="px-3 py-3 text-right">{previousAnnual.year}</th>
              <th className="px-3 py-3 text-right">{annual.year}</th>
              <th className="px-5 py-3 text-right">Change</th>
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
                <tr key={row.label} className="border-t border-outline">
                  <th className="px-5 py-3 text-left font-medium text-on-surface">
                    {row.label}
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums text-on-surface">
                    {formatMoney(row.previous, currency)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">
                    {formatMoney(row.current, currency)}
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${tone}`}>
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
