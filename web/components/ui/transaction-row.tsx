import { formatMoney, isPositiveEntry } from "@/lib/format-money";

export type TransactionRowData = {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  currency: string;
  note?: string;
  isPending?: boolean;
};

function describeEntryKind(entryKind: string) {
  const labels: Record<string, string> = {
    income_earned: "Income",
    expense_living: "Living expense",
    transfer_between_accounts: "Account transfer",
    investment_buy: "Investment purchase",
    investment_sell: "Investment sale",
    loan_disbursement: "Loan received",
    loan_repayment: "Loan repayment",
    debt_borrowed: "Money borrowed",
    debt_repayment: "Debt repayment",
  };

  return labels[entryKind]
    ?? entryKind.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function TransactionRow({ transaction }: { transaction: TransactionRowData }) {
  const positive = isPositiveEntry(transaction.entryKind);
  const date = new Date(transaction.transactionDate);
  const kindLabel = describeEntryKind(transaction.entryKind);
  const note = transaction.note?.trim();
  const label = note || kindLabel;
  const dateLabel = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-outline py-3.5 last:border-0">
      <div
        className={`grid size-9 place-items-center rounded-full text-base font-semibold ${positive ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"}`}
        aria-hidden="true"
      >
        {positive ? "+" : "−"}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-on-surface">{label}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-on-surface-soft">
          <span className="shrink-0">{dateLabel}</span>
          {note ? <><span aria-hidden="true">·</span><span className="truncate">{kindLabel}</span></> : null}
          {transaction.isPending ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">Pending</span> : null}
        </div>
      </div>
      <div className="min-w-0 text-right">
        <p className={`whitespace-nowrap text-sm font-bold tabular-nums ${positive ? "text-positive" : "text-negative"}`}>
          {positive ? "+" : "−"}{formatMoney(Math.abs(transaction.amount), transaction.currency)}
        </p>
        <p className="mt-0.5 text-[11px] text-on-surface-soft">{positive ? "Money in" : "Money out"}</p>
      </div>
    </div>
  );
}
