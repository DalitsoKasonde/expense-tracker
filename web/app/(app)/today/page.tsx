"use client";

import { AppPageHeader } from "@/components/app-page-header";
import { DashboardIcon } from "@/components/nav-icons";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiCall } from "@/lib/client-api";
import { getPendingTransactions } from "@/lib/offline-db";
import { UnifiedDashboardData, useUnifiedDashboard } from "@/lib/use-unified-dashboard";

interface Transaction {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  currency: string;
  note?: string;
  isPending?: boolean;
}

interface InsightSummary {
  freeCashFlow: number;
  netWorthChange: number;
  wealthBuildRateBps?: number | null;
  debtRemaining: number;
  interestLeakageBps?: number | null;
  borrowedDependencyBps?: number | null;
  alerts: string[];
}

const categoryLabels: Record<keyof Pick<UnifiedDashboardData, "income" | "expense" | "saving" | "investment">, string> = {
  income: "Income",
  expense: "Expense",
  saving: "Saving",
  investment: "Investment",
};

export default function TodayPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { data, loading: dashboardLoading } = useUnifiedDashboard();

  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setTransactionsLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      try {
        const apiFn = apiCallRef.current;
        const [transactions, insightResult] = await Promise.all([
          apiFn<Transaction[]>("/v1/transactions?limit=5"),
          apiFn<InsightSummary>("/v1/dashboard/insights").catch(() => null),
        ]);
        setInsights(insightResult);

        // Fetch offline transactions to prepend
        const pending = await getPendingTransactions();
        const pendingTxList = pending.map((item) => ({
          id: item.id,
          transactionDate: item.payload.transactionDate,
          entryKind: item.payload.entryKind,
          amount: item.payload.amount,
          currency: item.payload.currency,
          note: item.payload.note,
          isPending: true,
        }));

        const combinedTransactions = [...pendingTxList, ...(transactions ?? [])];
        setRecentTransactions(combinedTransactions.slice(0, 5));
      } catch (err) {
        console.error("Failed to fetch dashboard", err);
      } finally {
        setTransactionsLoading(false);
      }
    };

    void fetchDashboard();
  }, [session?.accessToken]);

  const trendPoints = useMemo(() => {
    if (!data) return [];
    return [
      0,
      data.income * 0.35,
      data.income * 0.8,
      data.income * 0.8 - data.expense * 0.4,
      data.income * 0.8 - data.expense * 0.7,
      data.netCashFlow,
    ].map((v) => v / 100);
  }, [data]);

  const plannerItems = useMemo(() => {
    if (!data) {
      return [];
    }

    const expenseRatio = data.income > 0 ? Math.round((data.expense / data.income) * 100) : 0;
    const reserveRatio = data.expense > 0 ? Math.round(((data.saving + data.investment) / data.expense) * 100) : 0;
    const pendingCount = recentTransactions.filter((tx) => tx.isPending).length;

    return [
      {
        title: "Watch the expense load",
        note: `${expenseRatio}% of income is already supporting this month's outflow.`,
      },
      {
        title: "Protect the reserve rhythm",
        note: `${reserveRatio}% of current outflow is matched by saving and investment movement.`,
      },
      {
        title: "Close the open entries",
        note: pendingCount > 0 ? `${pendingCount} recent entr${pendingCount === 1 ? "y is" : "ies are"} still syncing.` : "Everything recent is already in step.",
      },
    ];
  }, [data, recentTransactions]);

  const insightCards = useMemo(() => {
    if (!insights) {
      return [];
    }
    return [
      { label: "Free Cash Flow", value: formatMoney(insights.freeCashFlow) },
      { label: "Net Worth Change", value: formatMoney(insights.netWorthChange) },
      { label: "Wealth Build Rate", value: formatBps(insights.wealthBuildRateBps) },
      { label: "Debt Remaining", value: formatMoney(insights.debtRemaining) },
      { label: "Interest Leakage", value: formatBps(insights.interestLeakageBps) },
      { label: "Borrowed Dependency", value: formatBps(insights.borrowedDependencyBps) },
    ];
  }, [insights]);

  if (dashboardLoading || transactionsLoading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed ledger"
          title="Overview"
          accent="Today"
          lead="A premium, quick-reading picture of this month's balance, allocation, and latest money movement."
          icon={DashboardIcon}
        />

        {data ? (
          <>
            <div className="overviewHeroGrid">
              <section className="heroCard overviewPrimaryCard">
                <div className="overviewHeroTop">
                  <div>
                    <p className="heroMeta">This month</p>
                    <h2 className="dashboardHeroAmount">ZMW {(data.netCashFlow / 100).toFixed(2)}</h2>
                    <p className="heroSubline">Net balance across income, spending, saving, and investment movement.</p>
                  </div>

                  <div className="pillList">
                    <span className="pill">Net worth ZMW {(data.netWorth / 100).toFixed(0)}</span>
                    <span className="pill">Income ZMW {(data.income / 100).toFixed(0)}</span>
                    <span className="pill">Expense ZMW {(data.expense / 100).toFixed(0)}</span>
                  </div>
                </div>

                <div className="trendFrame">
                  <TrendChart points={trendPoints} />
                </div>
              </section>

              <aside className="spotlightCard overviewAccentQuote">
                <span className="sectionKicker">Inscribed note</span>
                <h2 className="sectionHeading">A calm ledger is built from consistent entries, not dramatic corrections.</h2>
                <p className="muted">
                  Keep saving and investment movement visible enough to guide the month before spending becomes reactive.
                </p>
                <span className="pageAccent">Small entries, steady clarity</span>
              </aside>
            </div>

            {insightCards.length > 0 ? (
              <section className="card allocationPanel">
                <div className="sectionHeaderCopy">
                  <p className="sectionKicker">Financial pulse</p>
                  <h2 className="sectionHeading">Practical insight</h2>
                </div>
                <div className="allocationGrid">
                  {insightCards.map((item) => (
                    <article key={item.label} className="allocationTile">
                      <span className="metricCardLabel">{item.label}</span>
                      <strong className="metricCardValue">{item.value}</strong>
                    </article>
                  ))}
                </div>
                {insights?.alerts?.length ? (
                  <div className="pillList">
                    {insights.alerts.map((alert) => (
                      <span key={alert} className="pill">
                        {alert}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="editorialBoard">
              <section className="card plannerCard">
                <div className="sectionHeaderCopy">
                  <p className="sectionKicker">Daily rhythm</p>
                  <h2 className="sectionHeading">Guidance for the next few entries</h2>
                </div>
                <div className="plannerList">
                  {plannerItems.map((item) => (
                    <article key={item.title} className="plannerItem">
                      <div className="plannerBullet" aria-hidden="true" />
                      <div className="resourceBody">
                        <strong>{item.title}</strong>
                        <span className="muted">{item.note}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card allocationPanel">
                <div className="sectionHeaderCopy">
                  <p className="sectionKicker">Allocation</p>
                  <h2 className="sectionHeading">How the month is being divided</h2>
                </div>
                <div className="allocationGrid">
                  {(["income", "expense", "saving", "investment"] as const).map((key) => (
                    <article key={key} className="allocationTile">
                      <span className="metricCardLabel">{categoryLabels[key]}</span>
                      <strong className="metricCardValue">ZMW {(data[key] / 100).toFixed(2)}</strong>
                      <span className="muted">
                        {key === "income"
                          ? "Incoming"
                          : key === "expense"
                            ? "Spent"
                            : key === "saving"
                              ? "Set aside"
                              : "Committed"}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}

        <section className="card recentLedgerPanel">
          <div className="sectionHeader">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Recent activity</p>
              <h2 className="sectionHeading">Latest entries</h2>
            </div>
            <Link href="/transactions" className="ghostButton">
              Open history
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="resourceBody">
              <strong>No transactions yet</strong>
              <span className="muted">Start with a quick entry and the dashboard will begin to take shape.</span>
            </div>
          ) : (
            <div className="ledgerList">
              {recentTransactions.map((tx) => {
                const isPositive =
                  tx.entryKind === "income_earned" ||
                  tx.entryKind === "income_borrowed" ||
                  tx.entryKind === "investment_income" ||
                  tx.entryKind === "bond_principal_redemption";
                const transactionDate = new Date(tx.transactionDate);

                return (
                  <div key={tx.id} className="ledgerRow">
                    <div className="ledgerDateBlock">
                      <span className="ledgerDateDay">{transactionDate.getDate()}</span>
                      <span className="ledgerDateMonth">
                        {transactionDate.toLocaleDateString(undefined, { month: "short" })}
                      </span>
                    </div>
                    <div className="ledgerPrimary">
                      <p className="ledgerTitle">{tx.note?.trim() || tx.entryKind.replaceAll("_", " ")}</p>
                      <div className="ledgerMeta">
                        <span className="metaBadge">{tx.isPending ? "Pending sync" : tx.entryKind.replaceAll("_", " ")}</span>
                        <span className="muted">{transactionDate.toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="ledgerAmountBlock">
                      <span className={isPositive ? "ledgerAmount positive" : "ledgerAmount negative"}>
                        {isPositive ? "+" : "-"}
                        {tx.currency} {(tx.amount / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="formActions">
          <Link href="/add" className="primaryButton">
            Add entry
          </Link>
          <Link href="/settings" className="ghostButton">
            Review settings
          </Link>
        </div>
      </section>
    </main>
  );
}

function formatMoney(value: number) {
  return `ZMW ${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatBps(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${(value / 100).toFixed(1)}%`;
}

// Custom Minimalist SVG Trend Chart Component
function TrendChart({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const width = 500;
  const height = 120;
  const padding = 10;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min === 0 ? 1 : max - min;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((p - min) / range) * (height - 2 * padding);
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

  return (
    <div style={{ width: "100%", height: "130px", marginTop: "24px" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.00" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGradient)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r="3.5"
            fill="var(--surface)"
            stroke="var(--primary)"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
}
