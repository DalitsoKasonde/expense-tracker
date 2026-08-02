"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useApiCall } from "@/lib/client-api";
import { FormDialog, type TransactionRowData } from "@/components/ui";

export type EditableTransaction = TransactionRowData & {
  accountId?: string;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  incomeSourceId?: string | null;
  businessId?: string | null;
  source?: string;
  assetId?: string | null;
  loanId?: string | null;
  originEventType?: string | null;
};

type AccountOption = {
  id: string;
  name: string;
  accountType?: string;
  accountClass?: string;
  currency?: string;
};

type CategoryOption = {
  id: string;
  name: string;
  categoryGroup?: string;
};

type Props = {
  transaction: EditableTransaction | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: (transaction: EditableTransaction) => void;
};

function toMinor(value: string) {
  return Math.round((Number.parseFloat(value || "0") || 0) * 100);
}

function toMajor(value: number) {
  return (value / 100).toFixed(2);
}

function isTransfer(entryKind: string) {
  return ["saving_transfer", "loan_receivable_advance", "loan_receivable_repayment"].includes(entryKind);
}

export function EditTransactionDialog({ transaction, accounts, categories, onClose, onSaved }: Props) {
  const apiCall = useApiCall();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ transactionDate: "", amount: "", accountId: "", destinationAccountId: "", categoryId: "", note: "" });

  useEffect(() => {
    if (!transaction) return;
    setForm({
      transactionDate: transaction.transactionDate.slice(0, 10),
      amount: toMajor(transaction.amount),
      accountId: transaction.accountId ?? "",
      destinationAccountId: transaction.destinationAccountId ?? "",
      categoryId: transaction.categoryId ?? "",
      note: transaction.note ?? "",
    });
    setError("");
  }, [transaction]);

  const matchingAccounts = useMemo(
    () => accounts.filter((account) => account.currency === transaction?.currency && account.accountClass === "asset"),
    [accounts, transaction?.currency],
  );
  const sourceAccounts = useMemo(() => matchingAccounts.filter((account) => {
    if (transaction?.entryKind === "loan_receivable_repayment") return account.accountType === "receivable";
    return account.accountType !== "receivable" && account.accountType !== "investment";
  }), [matchingAccounts, transaction?.entryKind]);
  const destinationAccounts = useMemo(() => matchingAccounts.filter((account) => {
    if (account.id === form.accountId) return false;
    if (transaction?.entryKind === "loan_receivable_advance") return account.accountType === "receivable";
    if (transaction?.entryKind === "loan_receivable_repayment") return account.accountType !== "receivable" && account.accountType !== "investment";
    return account.accountType !== "receivable" && account.accountType !== "investment";
  }), [form.accountId, matchingAccounts, transaction?.entryKind]);
  const categoryGroup = transaction?.entryKind === "income_earned" ? "income" : "expense";
  const matchingCategories = categories.filter((category) => category.categoryGroup === categoryGroup);
  const showCategory = transaction?.entryKind === "expense_living" || transaction?.entryKind === "income_earned";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transaction) return;
    const amount = toMinor(form.amount);
    if (amount <= 0) {
      setError("Amount must be greater than zero");
      return;
    }
    setPending(true);
    setError("");
    try {
      const updated = await apiCall<EditableTransaction>(`/v1/transactions/${transaction.id}`, {
        method: "PATCH",
        body: {
          transactionDate: form.transactionDate,
          entryKind: transaction.entryKind,
          amount,
          accountId: form.accountId || undefined,
          destinationAccountId: isTransfer(transaction.entryKind) ? form.destinationAccountId || undefined : undefined,
          categoryId: showCategory ? form.categoryId || undefined : undefined,
          incomeSourceId: transaction.incomeSourceId || undefined,
          businessId: transaction.businessId || undefined,
          note: form.note.trim() || undefined,
        },
      });
      if (!updated) throw new Error("Could not update transaction");
      onSaved({ ...transaction, ...updated, categoryName: categories.find((category) => category.id === updated.categoryId)?.name });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update transaction");
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog
      open={Boolean(transaction)}
      title="Edit transaction"
      description="Correct the account or transaction details. Linked investment and loan ledger rows are protected."
      submitLabel="Save changes"
      pending={pending}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-4">
        <div className="splitFields">
          <div className="field">
            <label htmlFor="edit-transaction-date">Date</label>
            <input id="edit-transaction-date" type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="edit-transaction-amount">Amount ({transaction?.currency})</label>
            <input id="edit-transaction-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="edit-transaction-account">{transaction?.entryKind === "saving_transfer" ? "From account" : "Account"}</label>
          <select id="edit-transaction-account" value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} required={transaction?.source !== "historical_backfill"}>
            {transaction?.source === "historical_backfill" ? <option value="">No account (historical)</option> : <option value="">Select account</option>}
            {sourceAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
          </select>
        </div>
        {transaction && isTransfer(transaction.entryKind) ? (
          <div className="field">
            <label htmlFor="edit-transaction-destination">To account</label>
            <select id="edit-transaction-destination" value={form.destinationAccountId} onChange={(event) => setForm((current) => ({ ...current, destinationAccountId: event.target.value }))} required>
              <option value="">Select destination</option>
              {destinationAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
            </select>
          </div>
        ) : null}
        {showCategory ? (
          <div className="field">
            <label htmlFor="edit-transaction-category">Category</label>
            <select id="edit-transaction-category" value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">No category</option>
              {matchingCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="edit-transaction-note">Note</label>
          <textarea id="edit-transaction-note" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </div>
      </div>
    </FormDialog>
  );
}
