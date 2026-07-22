"use client";

import { PageHeader } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
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
  freeCashFlow: number;
  netWorth: number;
  netWorthChange: number;
  wealthBuildRateBps?: Bps;
  savingsRateBps?: Bps;
  debtBurdenRateBps?: Bps;
  interestLeakageBps?: Bps;
  borrowedDependencyBps?: Bps;
  debtRemaining: number;
  interestFeesPaid: number;
  alerts: string[];
};

const moneyRows: Array<{ label: string; key: keyof MonthlyInsight; ytdMode?: "sum" | "latest" }> = [
  { label: "Earned Income", key: "earnedIncome" },
  { label: "Borrowed Income", key: "borrowedIncome" },
  { label: "Total Inflow", key: "totalInflow" },
  { label: "Living Expenses", key: "livingExpenses" },
  { label: "Debt Principal Paid", key: "debtPrincipalPaid" },
  { label: "Debt Interest/Fees", key: "debtInterestFees" },
  { label: "Savings", key: "savings" },
  { label: "Investments", key: "investments" },
  { label: "Operating Balance", key: "operatingBalance" },
  { label: "Free Cash Flow", key: "freeCashFlow" },
  { label: "Amount Brought Forward", key: "amountBroughtForward", ytdMode: "latest" },
  { label: "Ending Cash Balance", key: "endingCashBalance", ytdMode: "latest" },
  { label: "Net Worth", key: "netWorth", ytdMode: "latest" },
];

function formatBps(value: Bps) {
  if (value === null || value === undefined) return "—";
  return `${(value / 100).toFixed(1)}%`;
}

export default function ReportsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { currency } = useUserCurrency();
  const [annual, setAnnual] = useState<AnnualOverall | null>(null);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInitialized, setYearInitialized] = useState(false);

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
      try {
        const [annualResult, summaryResult] = await Promise.all([
          apiCallRef.current<AnnualOverall>(`/v1/dashboard/annual?year=${selectedYear}`),
          apiCallRef.current<InsightSummary>("/v1/dashboard/insights"),
        ]);
        if (!ignore) {
          if (!yearInitialized && annualResult?.availableYears?.length && annualResult.latestDataYear !== selectedYear) {
            setSelectedYear(annualResult.latestDataYear);
            setYearInitialized(true);
            return;
          }
          setAnnual(annualResult);
          setSummary(summaryResult);
          setError("");
          setYearInitialized(true);
        }
      } catch (loadError) {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void loadReports();
    return () => {
      ignore = true;
    };
  }, [currentYear, selectedYear, session?.accessToken, sessionStatus, yearInitialized]);

  const headlineMetrics = useMemo(
    () => [
      { label: "Free Cash Flow", value: summary ? formatMoney(summary.freeCashFlow, currency) : "—" },
      { label: "Net Worth Change", value: summary ? formatMoney(summary.netWorthChange, currency) : "—" },
      { label: "Wealth Build Rate", value: summary ? formatBps(summary.wealthBuildRateBps) : "—" },
      { label: "Debt Remaining", value: summary ? formatMoney(summary.debtRemaining, currency) : "—" },
      { label: "Interest Leakage", value: summary ? formatBps(summary.interestLeakageBps) : "—" },
      { label: "Borrowed Dependency", value: summary ? formatBps(summary.borrowedDependencyBps) : "—" },
    ],
    [currency, summary]
  );

  if (loading || sessionStatus === "loading") return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <PageHeader
          eyebrow="Reports"
          title="Reports"
          subtitle="Compare earned income, borrowed money, living costs, debt payments, savings, and investments."
        />

        {error ? <p className="statusText">{error}</p> : null}

        <section className="statsGrid">
          {headlineMetrics.map((metric) => (
            <article key={metric.label} className="statCard">
              <span className="metricCardLabel">{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </section>

        {summary?.alerts?.length ? (
          <section className="card resourceBody">
            <strong>Alerts</strong>
            <div className="pillList">
              {summary.alerts.map((alert) => (
                <span key={alert} className="pill">
                  {alert}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {annual ? (
          <section className="card annualPanel">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="sectionHeaderCopy">
                <p className="sectionKicker">{annual.year}</p>
                <h2 className="sectionHeading">OVERALL matrix</h2>
              </div>
              {annual.availableYears.length ? (
                <div className="field max-w-[180px]">
                  <label htmlFor="reportYear">Year</label>
                  <select
                    id="reportYear"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                  >
                    {annual.availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="annualTableScroll">
              <table className="annualTable">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {annual.data.map((month) => (
                      <th key={month.month}>{month.monthLabel}</th>
                    ))}
                    <th>YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {moneyRows.map((row) => (
                    <tr key={row.key}>
                      <th>{row.label}</th>
                      {annual.data.map((month) => (
                        <td key={`${row.key}-${month.month}`}>
                          {formatMoney(Number(month[row.key] ?? 0), currency)}
                        </td>
                      ))}
                      <td>{formatMoney(Number(annual.ytd[row.key] ?? 0), currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th>Savings Rate</th>
                    {annual.data.map((month) => (
                      <td key={`savings-rate-${month.month}`}>{formatBps(month.savingsRateBps)}</td>
                    ))}
                    <td>{formatBps(annual.ytd.savingsRateBps)}</td>
                  </tr>
                  <tr>
                    <th>Debt Burden Rate</th>
                    {annual.data.map((month) => (
                      <td key={`debt-rate-${month.month}`}>{formatBps(month.debtBurdenRateBps)}</td>
                    ))}
                    <td>{formatBps(annual.ytd.debtBurdenRateBps)}</td>
                  </tr>
                  <tr>
                    <th>Wealth Build Rate</th>
                    {annual.data.map((month) => (
                      <td key={`wealth-rate-${month.month}`}>{formatBps(month.wealthBuildRateBps)}</td>
                    ))}
                    <td>{formatBps(annual.ytd.wealthBuildRateBps)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
