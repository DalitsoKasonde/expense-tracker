"use client";

import { AppPageHeader } from "@/components/app-page-header";
import { DashboardIcon } from "@/components/nav-icons";
import { useApiCall } from "@/lib/client-api";
import { useEffect, useMemo, useState } from "react";

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

function formatMoney(value: number) {
  return `ZMW ${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBps(value: Bps) {
  if (value === null || value === undefined) return "—";
  return `${(value / 100).toFixed(1)}%`;
}

export default function ReportsPage() {
  const apiCall = useApiCall();
  const [annual, setAnnual] = useState<AnnualOverall | null>(null);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    let ignore = false;
    const loadReports = async () => {
      try {
        const [annualResult, summaryResult] = await Promise.all([
          apiCall<AnnualOverall>(`/v1/dashboard/annual?year=${currentYear}`),
          apiCall<InsightSummary>("/v1/dashboard/insights"),
        ]);
        if (!ignore) {
          setAnnual(annualResult);
          setSummary(summaryResult);
          setError("");
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
  }, [apiCall, currentYear]);

  const headlineMetrics = useMemo(
    () => [
      { label: "Free Cash Flow", value: summary ? formatMoney(summary.freeCashFlow) : "—" },
      { label: "Net Worth Change", value: summary ? formatMoney(summary.netWorthChange) : "—" },
      { label: "Wealth Build Rate", value: summary ? formatBps(summary.wealthBuildRateBps) : "—" },
      { label: "Debt Remaining", value: summary ? formatMoney(summary.debtRemaining) : "—" },
      { label: "Interest Leakage", value: summary ? formatBps(summary.interestLeakageBps) : "—" },
      { label: "Borrowed Dependency", value: summary ? formatBps(summary.borrowedDependencyBps) : "—" },
    ],
    [summary]
  );

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed ledger"
          title="Reports"
          accent="Annual overall"
          lead="A finance-first view separating earned income, borrowed money, living costs, debt service, and wealth-building movement."
          icon={DashboardIcon}
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
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">{annual.year}</p>
              <h2 className="sectionHeading">OVERALL matrix</h2>
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
                          {formatMoney(Number(month[row.key] ?? 0))}
                        </td>
                      ))}
                      <td>{formatMoney(Number(annual.ytd[row.key] ?? 0))}</td>
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
