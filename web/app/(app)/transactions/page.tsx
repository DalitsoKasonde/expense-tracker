"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { useEntriesChanged } from "@/lib/entries-bus";
import { getPendingTransactions } from "@/lib/offline-db";
import { isPositiveEntry } from "@/lib/format-money";
import {
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  PageShell,
  type TransactionFilterValue,
  TransactionFilters,
  TransactionRow,
} from "@/components/ui";
import { AddEntryButton } from "@/components/add-entry-button";
import { EditTransactionDialog, type EditableTransaction } from "@/components/edit-transaction-dialog";

type Transaction = EditableTransaction;
type Option = { id: string; name: string; accountType?: string; accountClass?: string; currency?: string; categoryGroup?: string };

function canEditTransaction(transaction: Transaction) {
  if (transaction.isPending || transaction.assetId || transaction.loanId) return false;
  if (transaction.originEventType && !["transaction_with_fee", "transaction_fee"].includes(transaction.originEventType)) return false;
  return ["expense_living", "income_earned", "saving_transfer", "loan_receivable_advance", "loan_receivable_repayment"].includes(transaction.entryKind);
}

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
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState<TransactionFilterValue>({ query: "", direction: "all" });
  // Bumping this re-runs the fetch effect below so a newly saved entry (added
  // from this page or from the sidebar/bottom nav) shows up without a manual
  // reload.
  const [reloadNonce, setReloadNonce] = useState(0);

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
  }, [session?.accessToken, reloadNonce]);

  useEntriesChanged(() => setReloadNonce((nonce) => nonce + 1));

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

  if (loading) return <PageShell><LoadingSkeleton className="h-24" /><LoadingSkeleton className="h-80" /></PageShell>;

  return (
    <PageShell>
      <PageHeader eyebrow="Activity" title="Money activity" subtitle="Find every payment, deposit, transfer, loan movement, and investment purchase." actions={<AddEntryButton className="btn btn-primary">Add entry</AddEntryButton>} />
      <section className="card min-w-0 max-w-full overflow-hidden"><TransactionFilters value={filters} onChange={setFilters} accounts={accounts} categories={categories} /></section>
      {error ? <div role="alert" className="rounded-md border border-negative/30 bg-negative-soft p-4 text-sm text-negative">{error}</div> : null}
      {groups.length ? <div className="grid gap-7">{groups.map(([label, rows]) => <section key={label}><div className="mb-3 flex items-center gap-4"><h2 className="shrink-0 text-sm font-semibold text-on-surface">{label}</h2><div className="h-px flex-1 bg-outline" /></div><div className="rounded-lg border border-outline bg-surface px-4 shadow-sm">{rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onEdit={canEditTransaction(transaction) ? () => setEditing(transaction) : undefined} />)}</div></section>)}</div> : <EmptyState title="No matching transactions" description="Adjust your filters or add a new entry to see activity here." action={<button type="button" className="btn btn-ghost" onClick={() => setFilters({ query: "", direction: "all" })}>Clear filters</button>} />}
      <EditTransactionDialog
        transaction={editing}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setTransactions((current) => current.map((transaction) => transaction.id === updated.id ? updated : transaction))}
      />
    </PageShell>
  );
}
