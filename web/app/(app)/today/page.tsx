"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiCall } from "@/lib/client-api";
import { getPendingTransactions } from "@/lib/offline-db";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { adaptSavingsGoals, type SavingsGoal } from "@/lib/dashboard-adapters";
import { formatMoney } from "@/lib/format-money";
import {
  AccountCard,
  ChartCard,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  SavingsGoalCard,
  TransactionRow,
  type TransactionRowData,
} from "@/components/ui";
import { AddEntryButton } from "@/components/add-entry-button";

type InsightSummary = {
  freeCashFlow: number;
  netWorthChange: number;
  wealthBuildRateBps?: number | null;
  debtRemaining: number;
  interestLeakageBps?: number | null;
  borrowedDependencyBps?: number | null;
  alerts: string[];
};

type SavingsGroupResponse = {
  id: string;
  accountId: string;
  name: string;
  isShareoutGroup: boolean;
  targetMinor?: number | null;
  contributedMinor?: number;
  currentBalance?: number;
};

export default function TodayPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { data, loading: dashboardLoading, error: dashboardError } = useUnifiedDashboard();
  const [transactions, setTransactions] = useState<TransactionRowData[]>([]);
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [groups, setGroups] = useState<SavingsGroupResponse[]>([]);
  const [secondaryLoading, setSecondaryLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setSecondaryLoading(false);
      return;
    }
    let ignore = false;
    async function loadSupportingData() {
      try {
        const api = apiCallRef.current;
        const [recent, insightResult, groupResult, pending] = await Promise.all([
          api<TransactionRowData[]>("/v1/transactions?limit=5"),
          api<InsightSummary>("/v1/dashboard/insights").catch(() => null),
          api<SavingsGroupResponse[]>("/v1/savings-groups").catch(() => []),
          getPendingTransactions(),
        ]);
        if (ignore) return;
        const pendingRows: TransactionRowData[] = pending.map((item) => ({
          id: item.id,
          transactionDate: item.payload.transactionDate,
          entryKind: item.payload.entryKind,
          amount: item.payload.amount,
          currency: item.payload.currency,
          note: item.payload.note,
          isPending: true,
        }));
        setTransactions([...pendingRows, ...(recent ?? [])].slice(0, 5));
        setInsights(insightResult);
        setGroups(groupResult ?? []);
      } finally {
        if (!ignore) setSecondaryLoading(false);
      }
    }
    void loadSupportingData();
    return () => { ignore = true; };
  }, [session?.accessToken]);

  const currency = data?.currency || "ZMW";
  const goals: SavingsGoal[] = useMemo(
    () => adaptSavingsGoals(groups, data?.accountBalances ?? [], currency),
    [currency, data?.accountBalances, groups],
  );

  if (dashboardLoading || secondaryLoading) {
    return <main className="mx-auto grid min-h-screen max-w-app gap-6 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10"><LoadingSkeleton className="h-24" /><div className="grid gap-6 md:grid-cols-3"><LoadingSkeleton className="h-40" /><LoadingSkeleton className="h-40" /><LoadingSkeleton className="h-40" /></div><LoadingSkeleton className="h-80" /></main>;
  }

  if (!data) {
    return <main className="mx-auto min-h-screen max-w-app px-4 py-8 pb-28 sm:px-8 lg:px-12"><EmptyState title="Dashboard unavailable" description={dashboardError || "We could not load your financial overview. Please check your connection and try again."} action={<button className="primaryButton" type="button" onClick={() => window.location.reload()}>Try again</button>} /></main>;
  }

  const assetAccounts = data.accountBalances.filter((account) => account.accountClass !== "liability");
  const liabilityAccounts = data.accountBalances.filter((account) => account.accountClass === "liability");

  return (
    <main className="mx-auto grid min-h-screen max-w-app gap-8 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        eyebrow="Home"
        title="Your money today"
        subtitle="See what is available, what changed this month, and what needs your attention."
        actions={<Link href="/reports" className="ghostButton">View reports</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial summary">
        <MetricCard label="Cash balance" value={formatMoney(data.cashBalance, currency)} detail={`As of ${new Date(data.asOfDate).toLocaleDateString()}`} />
        <MetricCard label="Monthly cash flow" value={formatMoney(data.netCashFlow, currency)} tone={data.netCashFlow >= 0 ? "income" : "expense"} detail="Inflow less monthly movement" />
        <MetricCard label="Income" value={formatMoney(data.income, currency)} tone="income" detail="Earned this month" />
        <MetricCard label="Expenses" value={formatMoney(data.expense, currency)} tone="expense" detail="Spent this month" />
      </section>

      <AddEntryButton className="flex min-h-14 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:justify-self-start">
        <span className="mr-2 text-xl" aria-hidden="true">+</span> Add entry
      </AddEntryButton>

      <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm" aria-labelledby="attention-heading">
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Next steps</p>
          <h2 id="attention-heading" className="mt-1 text-lg font-semibold text-on-surface">Needs your attention</h2>
        </div>
        {insights?.alerts?.length ? (
          <ul className="grid gap-2">
            {insights.alerts.map((alert) => <li key={alert} className="rounded-md bg-warning-soft px-4 py-3 text-sm text-on-surface">{alert}</li>)}
          </ul>
        ) : (
          <EmptyState title="Nothing urgent" description="Your recorded accounts and recent activity do not need attention right now." />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-outline pb-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Activity</p><h2 className="mt-1 text-lg font-semibold text-on-surface">Recent transactions</h2></div>
            <Link href="/transactions" className="text-sm font-semibold text-accent hover:underline">View history</Link>
          </div>
          {transactions.length ? <div>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div> : <div className="pt-5"><EmptyState title="No transactions yet" description="Add your first entry and recent activity will appear here." /></div>}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Accounts</p><h2 className="mt-1 text-lg font-semibold text-on-surface">Your balances</h2></div><Link href="/settings/accounts" className="text-sm font-semibold text-accent hover:underline">Manage</Link></div>
          {data.accountBalances.length ? (
            <div className="grid gap-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-on-surface">Accounts</h3>
                    <p className="text-xs text-on-surface-soft">Places where your money lives.</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-soft">{assetAccounts.length}</span>
                </div>
                {assetAccounts.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">{assetAccounts.slice(0, 4).map((account, index) => <AccountCard key={account.accountId} name={account.name} type={account.accountType} accountClass={account.accountClass} balanceMinor={account.balanceMinor} currency={account.currency} primary={index === 0} />)}</div> : <EmptyState title="No accounts" description="Create an account to begin tracking balances." />}
              </div>
              {liabilityAccounts.length ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                      <h3 className="text-sm font-semibold text-on-surface">Money you owe</h3>
                      <p className="text-xs text-on-surface-soft">Debt from loans you have recorded in the app.</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-soft">{liabilityAccounts.length}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    {liabilityAccounts.slice(0, 3).map((account, index) => (
                      <AccountCard
                        key={account.accountId}
                        name={account.name}
                        type={account.accountType}
                        accountClass={account.accountClass}
                        balanceMinor={account.balanceMinor}
                        currency={account.currency}
                        primary={index === 0}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : <EmptyState title="No accounts" description="Create an account to begin tracking balances." />}
        </section>
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Goals</p><h2 className="mt-1 text-lg font-semibold text-on-surface">Savings progress</h2></div><Link href="/goals" className="text-sm font-semibold text-accent hover:underline">Manage goals</Link></div>
        {goals.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{goals.slice(0, 3).map((goal) => <SavingsGoalCard key={goal.id} {...goal} href="/goals" />)}</div> : <EmptyState title="No savings goals yet" description="Create a personal target and track its progress here." action={<Link href="/goals" className="ghostButton">Create a goal</Link>} />}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <ChartCard title="Income and expenses" subtitle="Current month movement" summary={`Income is ${formatMoney(data.income, currency)} and expenses are ${formatMoney(data.expense, currency)}. Net cash flow is ${formatMoney(data.netCashFlow, currency)}.`}>
          <CashFlowChart income={data.income} expense={data.expense} />
        </ChartCard>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1" aria-label="Financial insights">
          <MetricCard label="Net worth" value={formatMoney(data.netWorth, currency)} detail="Assets less liabilities" />
          <MetricCard label="Free cash flow" value={formatMoney(insights?.freeCashFlow ?? data.freeCashFlow, currency)} tone={(insights?.freeCashFlow ?? data.freeCashFlow) >= 0 ? "savings" : "expense"} />
        </section>
      </div>
    </main>
  );
}

function CashFlowChart({ income, expense }: { income: number; expense: number }) {
  const max = Math.max(income, expense, 1);
  const incomeHeight = Math.max(4, Math.round((income / max) * 150));
  const expenseHeight = Math.max(4, Math.round((expense / max) * 150));
  return (
    <div className="flex h-52 items-end justify-center gap-12 border-b border-l border-outline px-8 pb-0">
      <div className="grid justify-items-center gap-2"><div className="w-16 rounded-t-md bg-income" style={{ height: incomeHeight }} /><span className="text-xs font-semibold text-on-surface-soft">Income</span></div>
      <div className="grid justify-items-center gap-2"><div className="w-16 rounded-t-md bg-expense" style={{ height: expenseHeight }} /><span className="text-xs font-semibold text-on-surface-soft">Expenses</span></div>
    </div>
  );
}
