"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { supportedCurrencies } from "@/lib/currencies";
import { formatMoney } from "@/lib/format-money";
import { useUserCurrency } from "@/lib/use-user-currency";
import { ConfirmationDialog, FormDialog } from "@/components/ui/dialogs";

type Account = {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
  openingBalanceMinor: number;
  hasTransactions: boolean;
  isSavingsGroupAccount?: boolean;
};

type DashboardAccountBalance = {
  accountId: string;
  balanceMinor: number;
};

type UnifiedDashboardResponse = {
  accountBalances: DashboardAccountBalance[];
};

const accountTypeOptions = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank", label: "Bank" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "receivable", label: "Money owed to me" },
  { value: "other", label: "Other" },
];

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

function fromMinor(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export default function AccountsSettingsPage() {
  const apiCall = useApiCall();
  const { currency: userCurrency } = useUserCurrency();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balancesByAccountId, setBalancesByAccountId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", accountType: "cash", currency: userCurrency, openingBalance: "" });
  const assetAccounts = accounts.filter((account) => account.accountClass !== "liability" && !account.isSavingsGroupAccount);
  const liabilityAccounts = accounts.filter((account) => account.accountClass === "liability");
  const accountPendingDeletion = accounts.find((account) => account.id === deleteId);
  const editingAccount = accounts.find((account) => account.id === editingId);
  // The balance only stays editable while nothing has moved through the account;
  // after that it is derived from transactions.
  const canEditBalance = !editingId || (editingAccount !== undefined && !editingAccount.hasTransactions);

  async function loadAccounts() {
    const result = await apiCall<Account[]>("/v1/accounts");
    const nextAccounts = result ?? [];
    setAccounts(nextAccounts);

    const currencies = [...new Set(nextAccounts.map((account) => account.currency))];
    const dashboards = await Promise.all(
      currencies.map(async (currency) => {
        const dashboard = await apiCall<UnifiedDashboardResponse>(
          `/v1/dashboard/unified?currency=${encodeURIComponent(currency)}`
        );
        return dashboard?.accountBalances ?? [];
      })
    );

    const nextBalances = dashboards.flat().reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.accountId] = item.balanceMinor;
      return accumulator;
    }, {});

    setBalancesByAccountId(nextBalances);
  }

  useEffect(() => {
    void loadAccounts()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  function resetForm() {
    setEditingId(null);
    setCreateOpen(false);
    setForm({ name: "", accountType: "cash", currency: userCurrency, openingBalance: "" });
  }

  useEffect(() => {
    if (!editingId) {
      setForm((current) => (current.currency === userCurrency ? current : { ...current, currency: userCurrency }));
    }
  }, [editingId, userCurrency]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      if (editingId) {
        await apiCall<Account>(`/v1/accounts/${editingId}`, {
          method: "PATCH",
          body: {
            name: form.name,
            accountType: form.accountType,
            currency: form.currency,
            ...(canEditBalance ? { openingBalanceMinor: toMinor(form.openingBalance) } : {}),
          },
        });
      } else {
        await apiCall<Account>("/v1/accounts", {
          method: "POST",
          body: {
            name: form.name,
            accountType: form.accountType,
            currency: form.currency,
            openingBalanceMinor: toMinor(form.openingBalance),
          },
        });
      }

      await loadAccounts();
      resetForm();
      setStatus(editingId ? "Account updated." : "Account created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) {
      return;
    }
    try {
      await apiCall(`/v1/accounts/${deleteId}`, { method: "DELETE" });
      await loadAccounts();
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId(null);
      setStatus("Account deleted from active accounts. Any transaction history was preserved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove account");
    }
  }

  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="resourceBody">
            <strong>Existing accounts</strong>
            <span className="muted">Manage accounts that hold your money or track money owed to you. Loan balances you owe are shown below as read-only.</span>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setStatus("");
              setEditingId(null);
              setCreateOpen(true);
              setForm({ name: "", accountType: "cash", currency: userCurrency, openingBalance: "" });
            }}
          >
            Create account
          </button>
        </div>

        <div className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <strong>Accounts table</strong>
          </div>
          <div className="overflow-x-auto">
            {loading ? <div className="muted">Loading accounts...</div> : null}
            {!loading && accounts.length === 0 ? (
              <div className="muted">No accounts yet. Create one to start tracking balances.</div>
            ) : null}
            {assetAccounts.length ? (
              <table className="dataTable">
                <thead>
                  <tr className="text-on-surface-soft">
                    <th className="font-semibold">Name</th>
                    <th className="font-semibold">Type</th>
                    <th className="font-semibold">Balance</th>
                    <th className="font-semibold">Currency</th>
                    <th className="font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assetAccounts.map((account) => (
                    <tr key={account.id}>
                      <td data-label="Name" className="font-semibold text-on-surface">{account.name}</td>
                      <td data-label="Type" className="text-on-surface-soft">{account.accountType.replaceAll("_", " ")}</td>
                      <td data-label="Balance" className="text-on-surface">
                        {formatMoney(balancesByAccountId[account.id] ?? 0, account.currency)}
                      </td>
                      <td data-label="Currency" className="text-on-surface-soft">{account.currency}</td>
                      <td data-label="Actions">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => {
                              setStatus("");
                              setCreateOpen(false);
                              setEditingId(account.id);
                              setForm({
                                name: account.name,
                                accountType: account.accountType,
                                currency: account.currency,
                                openingBalance: account.hasTransactions ? "" : fromMinor(account.openingBalanceMinor),
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button className="btn btn-danger" type="button" onClick={() => setDeleteId(account.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!loading && assetAccounts.length === 0 && accounts.length > 0 ? (
              <div className="muted">No editable asset accounts yet.</div>
            ) : null}
          </div>
          {liabilityAccounts.length ? (
            <div className="resourceList">
              <div className="resourceBody">
                <strong>Money you owe</strong>
                <span className="muted">These balances are created automatically when you add a loan. To change them, open Loans.</span>
              </div>
              {liabilityAccounts.map((account) => (
                <div key={account.id} className="resourceRow">
                  <div className="resourceBody">
                    <strong>{account.name}</strong>
                    <div className="resourceMeta">
                      <span className="metaBadge">{account.currency}</span>
                      <span className="metaBadge">loan balance</span>
                      <span className="metaBadge">{account.accountType.replaceAll("_", " ")}</span>
                    </div>
                  </div>
                  <div className="formActions">
                    <Link className="btn btn-ghost" href={"/loans" as Route}>
                      Manage in loans
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {status ? <p className="statusText">{status}</p> : null}

      <FormDialog
        open={createOpen || editingId !== null}
        title={editingId ? "Edit account" : "Create account"}
        description="Use this for places where money is kept or balances that are owed to you."
        submitLabel={editingId ? "Update account" : "Create account"}
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={handleSubmit}
        onClose={resetForm}
      >
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Airtel Money"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="accountType">Account type</label>
            <select
              id="accountType"
              value={form.accountType}
              onChange={(event) => setForm((current) => ({ ...current, accountType: event.target.value }))}
            >
              {accountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={form.currency}
              onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
              required
            >
              {supportedCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>

          {canEditBalance ? (
            <div className="field">
              <label htmlFor="openingBalance">Current balance</label>
              <input
                id="openingBalance"
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))}
                placeholder="0.00"
                aria-describedby={editingId ? "openingBalanceHint" : undefined}
              />
              {editingId ? (
                <span className="muted" id="openingBalanceHint">
                  This account has no transactions yet, so you can correct its starting balance here. Once you record a
                  transaction, the balance changes through transactions instead.
                </span>
              ) : null}
            </div>
          ) : (
            <p className="muted">
              This account already has transactions, so its balance is calculated from them. Add a transaction to adjust
              it.
            </p>
          )}
        </div>
      </FormDialog>

      <ConfirmationDialog
        open={deleteId !== null}
        title={accountPendingDeletion ? `Delete ${accountPendingDeletion.name}?` : "Delete account?"}
        description={
          accountPendingDeletion
            ? `${accountPendingDeletion.name} currently shows ${formatMoney(
                balancesByAccountId[accountPendingDeletion.id] ?? 0,
                accountPendingDeletion.currency,
              )}. An account with a balance cannot be deleted. If it has transaction history, it will be hidden while that history remains in reports.`
            : "An account with a balance cannot be deleted. Historical transactions are preserved."
        }
        confirmLabel="Delete account"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteId(null)}
      />
    </section>
  );
}
