"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddEntryDialog, type EntryKind } from "@/components/add-entry-dialog";
import { useApiCall } from "@/lib/client-api";
import { useEntriesChanged } from "@/lib/entries-bus";
import { formatMoney } from "@/lib/format-money";

type Account = {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
};

type Transaction = {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  accountId?: string;
  destinationAccountId?: string;
};

type Debtor = {
  accountId: string;
  person: string;
  currency: string;
  owedMinor: number;
  lentMinor: number;
  repaidMinor: number;
  lastLentDate?: string;
  lastRepaymentDate?: string;
};

type PendingEntry = {
  entryKind: EntryKind;
  receivableAccountId?: string;
  counterpartyName?: string;
};

// Lending through Add entry names the account "Loan to <person>", so the person
// is what the row should lead with.
function personName(accountName: string) {
  return accountName.replace(/^Loan to /i, "").trim() || accountName;
}

function formatDay(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ReceivablesWorkspace() {
  const apiCall = useApiCall();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null);

  const loadData = useCallback(async () => {
    const [loadedAccounts, loadedTransactions] = await Promise.all([
      apiCall<Account[]>("/v1/accounts"),
      apiCall<Transaction[]>("/v1/transactions?limit=1000"),
    ]);
    setAccounts(loadedAccounts ?? []);
    setTransactions(loadedTransactions ?? []);
  }, [apiCall]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    void loadData()
      .catch((caught) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Failed to load who owes you");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [loadData]);

  // A lending entry saved elsewhere (e.g. the sidebar/bottom nav "Add entry")
  // should update balances here without a manual reload.
  useEntriesChanged(() => {
    void loadData().catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load who owes you"));
  });

  // One pass over the transactions: an advance credits the receivable as the
  // destination, a repayment debits it as the source.
  const debtors = useMemo(() => {
    const rows = new Map<string, Debtor>();
    for (const account of accounts) {
      if (account.accountType !== "receivable") continue;
      rows.set(account.id, {
        accountId: account.id,
        person: personName(account.name),
        currency: account.currency,
        owedMinor: 0,
        lentMinor: 0,
        repaidMinor: 0,
      });
    }

    for (const transaction of transactions) {
      if (transaction.entryKind === "loan_receivable_advance") {
        const row = transaction.destinationAccountId ? rows.get(transaction.destinationAccountId) : undefined;
        if (!row) continue;
        row.lentMinor += transaction.amount;
        row.owedMinor += transaction.amount;
        if (!row.lastLentDate || transaction.transactionDate > row.lastLentDate) {
          row.lastLentDate = transaction.transactionDate;
        }
      } else if (transaction.entryKind === "loan_receivable_repayment") {
        const row = transaction.accountId ? rows.get(transaction.accountId) : undefined;
        if (!row) continue;
        row.repaidMinor += transaction.amount;
        row.owedMinor -= transaction.amount;
        if (!row.lastRepaymentDate || transaction.transactionDate > row.lastRepaymentDate) {
          row.lastRepaymentDate = transaction.transactionDate;
        }
      }
    }

    return [...rows.values()].sort((first, second) => second.owedMinor - first.owedMinor);
  }, [accounts, transactions]);

  const outstanding = useMemo(() => debtors.filter((debtor) => debtor.owedMinor > 0), [debtors]);
  const settled = useMemo(() => debtors.filter((debtor) => debtor.owedMinor <= 0), [debtors]);

  // Amounts in different currencies are different money, so each currency gets
  // its own total rather than one meaningless sum.
  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const debtor of outstanding) {
      totals.set(debtor.currency, (totals.get(debtor.currency) ?? 0) + debtor.owedMinor);
    }
    return [...totals.entries()].sort((first, second) => second[1] - first[1]);
  }, [outstanding]);

  return (
    <section className="settingsSection grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="resourceBody">
          <strong>Owed to you</strong>
          <span className="muted">Everyone you have lent money to, and what is still outstanding.</span>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setPendingEntry({ entryKind: "loan_receivable_advance" })}
        >
          Lend money
        </button>
      </div>

      <div className="statsGrid">
        {totalsByCurrency.length ? (
          totalsByCurrency.map(([currency, total]) => (
            <div className="statCard" key={currency}>
              <span className="muted">Still owed to you</span>
              <strong>{formatMoney(total, currency)}</strong>
            </div>
          ))
        ) : (
          <div className="statCard">
            <span className="muted">Still owed to you</span>
            <strong>Nothing outstanding</strong>
          </div>
        )}
        <div className="statCard">
          <span className="muted">People who owe you</span>
          <strong>{outstanding.length}</strong>
        </div>
      </div>

      <section className="card settingsListPanel overflow-hidden">
        <div className="settingsHeaderRow">
          <strong>People</strong>
          <span className="muted">{outstanding.length} outstanding</span>
        </div>
        {loading ? <div className="muted p-4">Loading who owes you...</div> : null}
        {!loading && debtors.length === 0 ? (
          <div className="muted p-4">
            No one owes you yet. Use Lend money to record cash you hand over, and it will appear here.
          </div>
        ) : null}
        {debtors.length ? (
          <div className="overflow-x-auto">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Still owed</th>
                  <th>History</th>
                  <th>Last repayment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...outstanding, ...settled].map((debtor) => (
                  <tr key={debtor.accountId}>
                    <td data-label="Person">
                      <strong>{debtor.person}</strong>
                      {debtor.owedMinor <= 0 ? (
                        <div className="resourceMeta"><span className="metaBadge">settled</span></div>
                      ) : null}
                    </td>
                    <td data-label="Still owed">
                      <strong>{formatMoney(Math.max(0, debtor.owedMinor), debtor.currency)}</strong>
                    </td>
                    <td data-label="History" className="text-on-surface-soft">
                      Lent {formatMoney(debtor.lentMinor, debtor.currency)} · repaid{" "}
                      {formatMoney(debtor.repaidMinor, debtor.currency)}
                      <div className="muted">Last lent {formatDay(debtor.lastLentDate)}</div>
                    </td>
                    <td data-label="Last repayment" className="text-on-surface-soft">
                      {formatDay(debtor.lastRepaymentDate)}
                    </td>
                    <td data-label="Actions">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => setPendingEntry({
                            entryKind: "loan_receivable_repayment",
                            receivableAccountId: debtor.accountId,
                          })}
                        >
                          Record repayment
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => setPendingEntry({
                            entryKind: "loan_receivable_advance",
                            counterpartyName: debtor.person,
                          })}
                        >
                          Lend more
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {error ? <p className="statusText" role="alert">{error}</p> : null}

      <AddEntryDialog
        open={pendingEntry !== null}
        initialEntryKind={pendingEntry?.entryKind}
        initialReceivableAccountId={pendingEntry?.receivableAccountId}
        initialCounterpartyName={pendingEntry?.counterpartyName}
        onClose={() => setPendingEntry(null)}
        onSaved={() => {
          setPendingEntry(null);
          void loadData().catch(() => undefined);
        }}
      />
    </section>
  );
}
