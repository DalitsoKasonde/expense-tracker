"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";

type Account = {
  id: string;
  name: string;
  accountType: string;
  currency: string;
};

const accountTypeOptions = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank", label: "Bank" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

export default function AccountsSettingsPage() {
  const apiCall = useApiCall();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", accountType: "cash", currency: "ZMW" });

  async function loadAccounts() {
    const result = await apiCall<Account[]>("/v1/accounts");
    setAccounts(result ?? []);
  }

  useEffect(() => {
    void loadAccounts()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", accountType: "cash", currency: "ZMW" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      if (editingId) {
        await apiCall<Account>(`/v1/accounts/${editingId}`, {
          method: "PATCH",
          body: form,
        });
      } else {
        await apiCall<Account>("/v1/accounts", {
          method: "POST",
          body: form,
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

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Delete this account? If it already has transactions, the backend will archive it instead of hard deleting it."
    );
    if (!confirmed) {
      return;
    }

    try {
      await apiCall(`/v1/accounts/${id}`, { method: "DELETE" });
      await loadAccounts();
      if (editingId === id) {
        resetForm();
      }
      setStatus("Account removed or archived.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove account");
    }
  }

  return (
    <section className="settingsSection">
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Accounts</p>
        <h2 className="sectionHeading">Where money lives</h2>
        <p className="muted">Create the live balance homes that quick entry, history, and portfolio views rely on.</p>
      </div>

      <div className="settingsDetailGrid">
        <form className="card settingsFormPanel" onSubmit={handleSubmit}>
          <div className="settingsHeaderRow">
            <div className="resourceBody">
              <strong>{editingId ? "Edit account" : "Create account"}</strong>
              <span className="muted">Accounts represent the wallets, banks, savings spaces, and investment homes behind the ledger.</span>
            </div>
          </div>

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

          <div className="formActions">
            <button className="primaryButton" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update account" : "Create account"}
            </button>
            {editingId ? (
              <button className="ghostButton" type="button" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>

          {status ? <p className="statusText">{status}</p> : null}
        </form>

        <div className="card settingsListPanel">
          <div className="settingsHeaderRow">
            <div className="resourceBody">
              <strong>Existing accounts</strong>
              <span className="muted">Review account type, currency, and balance destination before editing.</span>
            </div>
          </div>
          <div className="resourceList">
            {loading ? <div className="muted">Loading accounts...</div> : null}
            {!loading && accounts.length === 0 ? (
              <div className="muted">No accounts yet. Create one to start tracking balances.</div>
            ) : null}
            {accounts.map((account) => (
              <div key={account.id} className="resourceRow">
                <div className="resourceBody">
                  <strong>{account.name}</strong>
                  <div className="resourceMeta">
                    <span className="metaBadge">{account.currency}</span>
                    <span className="metaBadge">{account.accountType.replaceAll("_", " ")}</span>
                  </div>
                </div>
                <div className="formActions">
                  <button
                    className="ghostButton"
                    type="button"
                    onClick={() => {
                      setEditingId(account.id);
                      setForm({
                        name: account.name,
                        accountType: account.accountType,
                        currency: account.currency,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button className="ghostButton" type="button" onClick={() => void handleDelete(account.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
