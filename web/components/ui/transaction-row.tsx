import { formatMoney, isPositiveEntry } from "@/lib/format-money";

export type TransactionRowData = {
  id: string; transactionDate: string; entryKind: string; amount: number; currency: string; note?: string; isPending?: boolean;
};

export function TransactionRow({ transaction }: { transaction: TransactionRowData }) {
  const positive = isPositiveEntry(transaction.entryKind);
  const date = new Date(transaction.transactionDate);
  const label = transaction.note?.trim() || transaction.entryKind.replaceAll("_", " ");
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-outline px-1 py-4 last:border-0 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
      <div className="grid size-11 place-items-center rounded-md bg-surface-soft text-center leading-none">
        <strong className="text-sm text-on-surface">{date.getDate()}</strong>
        <span className="text-[10px] uppercase text-on-surface-soft">{date.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-on-surface">{label}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-on-surface-soft">
          <span className="rounded-sm bg-primary-softer px-1.5 py-0.5 text-primary">{transaction.entryKind.replaceAll("_", " ")}</span>
          {transaction.isPending ? <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-warning">Pending sync</span> : null}
        </div>
      </div>
      <p className={`col-start-2 font-semibold tabular-nums sm:col-start-auto ${positive ? "text-positive" : "text-negative"}`}>
        {positive ? "+" : "-"}{formatMoney(Math.abs(transaction.amount), transaction.currency)}
      </p>
    </div>
  );
}
