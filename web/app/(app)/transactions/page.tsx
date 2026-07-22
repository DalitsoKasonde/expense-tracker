"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { getPendingTransactions } from "@/lib/offline-db";
import { isPositiveEntry } from "@/lib/format-money";
import { EmptyState, LoadingSkeleton, PageHeader, TransactionFilters, TransactionRow, type TransactionFilterValue, type TransactionRowData } from "@/components/ui";
import { AddEntryButton } from "@/components/add-entry-button";

type Transaction = TransactionRowData & { accountId?: string; categoryId?: string };
type Option = { id: string; name: string };

export default function TransactionsPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<TransactionFilterValue>({ query: "", direction: "all" });

  useEffect(() => {
    if (!session?.accessToken) { setLoading(false); return; }
    let ignore = false;
    async function load() {
      try {
        const api = apiCallRef.current;
        const [rows, accountRows, categoryRows, pending] = await Promise.all([
          api<Transaction[]>("/v1/transactions?limit=100"),
          api<Option[]>("/v1/accounts").catch(() => []),
          api<Option[]>("/v1/categories").catch(() => []),
          getPendingTransactions(),
        ]);
        if (ignore) return;
        const queued: Transaction[] = pending.map((item) => ({ id: item.id, transactionDate: item.payload.transactionDate, entryKind: item.payload.entryKind, amount: item.payload.amount, currency: item.payload.currency, note: item.payload.note, accountId: item.payload.accountId, categoryId: item.payload.categoryId, isPending: true }));
        setTransactions([...queued, ...(rows ?? [])]);
        setAccounts(accountRows ?? []);
        setCategories(categoryRows ?? []);
      } catch (reason) {
        if (!ignore) setError(reason instanceof Error ? reason.message : "Could not load transactions");
      } finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; };
  }, [session?.accessToken]);

  const filtered = useMemo(() => transactions.filter((transaction) => {
    const query = filters.query.trim().toLowerCase();
    const date = transaction.transactionDate.slice(0, 10);
    return (!query || `${transaction.note ?? ""} ${transaction.entryKind}`.toLowerCase().includes(query))
      && (filters.direction === "all" || (filters.direction === "inflow" && isPositiveEntry(transaction.entryKind)) || (filters.direction === "outflow" && !isPositiveEntry(transaction.entryKind)) || (filters.direction === "pending" && transaction.isPending))
      && (!filters.startDate || date >= filters.startDate)
      && (!filters.endDate || date <= filters.endDate)
      && (!filters.accountId || transaction.accountId === filters.accountId)
      && (!filters.categoryId || transaction.categoryId === filters.categoryId);
  }), [filters, transactions]);

  const groups = useMemo(() => {
    const result = new Map<string, Transaction[]>();
    filtered.forEach((transaction) => {
      const label = new Date(transaction.transactionDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      result.set(label, [...(result.get(label) ?? []), transaction]);
    });
    return [...result.entries()];
  }, [filtered]);

  if (loading) return <main className="mx-auto grid min-h-screen max-w-app gap-6 px-4 py-8 pb-28 sm:px-8 lg:px-12"><LoadingSkeleton className="h-24" /><LoadingSkeleton className="h-80" /></main>;

  return (
    <main className="mx-auto grid min-h-screen max-w-app gap-8 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader eyebrow="Activity" title="Money activity" subtitle="Find every payment, deposit, transfer, loan movement, and investment purchase." actions={<AddEntryButton className="primaryButton">Add entry</AddEntryButton>} />
      <section className="rounded-lg border border-outline bg-surface p-5 shadow-sm"><TransactionFilters value={filters} onChange={setFilters} accounts={accounts} categories={categories} /></section>
      {error ? <div role="alert" className="rounded-md border border-negative/30 bg-negative-soft p-4 text-sm text-negative">{error}</div> : null}
      {groups.length ? <div className="grid gap-7">{groups.map(([label, rows]) => <section key={label}><div className="mb-3 flex items-center gap-4"><h2 className="shrink-0 text-sm font-semibold text-on-surface">{label}</h2><div className="h-px flex-1 bg-outline" /></div><div className="rounded-lg border border-outline bg-surface px-4 shadow-sm">{rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div></section>)}</div> : <EmptyState title="No matching transactions" description="Adjust your filters or add a new entry to see activity here." action={<button type="button" className="ghostButton" onClick={() => setFilters({ query: "", direction: "all" })}>Clear filters</button>} />}
    </main>
  );
}
