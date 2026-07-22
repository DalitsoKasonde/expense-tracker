"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
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
  { value: "other", label: "Other" },
];

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
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
  const assetAccounts = accounts.filter((account) => account.accountClass !== "liability");
  const liabilityAccounts = accounts.filter((account) => account.accountClass === "liability");

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
      setStatus("Account removed or archived.");
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
            <span className="muted">Manage the accounts that hold your money here. Loan balances are shown below as read-only.</span>
          </div>
          <button
            className="primaryButton"
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
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline text-left text-on-surface-soft">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Currency</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assetAccounts.map((account) => (
                    <tr key={account.id} className="border-b border-outline/70 last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-on-surface">{account.name}</td>
                      <td className="px-4 py-3 text-on-surface-soft">{account.accountType.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3 text-on-surface">
                        {formatMoney(balancesByAccountId[account.id] ?? 0, account.currency)}
                      </td>
                      <td className="px-4 py-3 text-on-surface-soft">{account.currency}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="ghostButton"
                            type="button"
                            onClick={() => {
                              setStatus("");
                              setCreateOpen(false);
                              setEditingId(account.id);
                              setForm({
                                name: account.name,
                                accountType: account.accountType,
                                currency: account.currency,
                                openingBalance: "",
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button className="ghostButton" type="button" onClick={() => setDeleteId(account.id)}>
                            Remove
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
                    <Link className="ghostButton" href={"/loans" as Route}>
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
        description="Use this for the places where your money is kept."
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
            <input
              id="currency"
              value={form.currency}
              onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
              placeholder="ZMW"
              required
            />
          </div>

          {!editingId ? (
            <div className="field">
              <label htmlFor="openingBalance">Current balance</label>
              <input
                id="openingBalance"
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))}
                placeholder="0.00"
              />
            </div>
          ) : null}
        </div>
      </FormDialog>

      <ConfirmationDialog
        open={deleteId !== null}
        title="Remove account?"
        description="If the account still has money or debt, removal will be blocked. If the balance is zero but history exists, it will be archived instead of permanently deleted."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteId(null)}
      />
    </section>
  );
}
