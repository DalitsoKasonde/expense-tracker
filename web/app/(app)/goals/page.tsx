"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddEntryButton } from "@/components/add-entry-button";
import { EmptyState, FormDialog, LoadingSkeleton, PageHeader, SavingsGoalCard } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useUserCurrency } from "@/lib/use-user-currency";

type SavingsGroup = {
  id: string;
  accountId: string;
  name: string;
  isShareoutGroup: boolean;
  targetMinor?: number | null;
  currentBalance: number;
};

type Account = {
  id: string;
  name: string;
  currency: string;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((Number.parseFloat(value || "0") || 0) * 100);
}

export default function GoalsPage() {
  const apiCall = useApiCall();
  const { currency } = useUserCurrency();
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", target: "" });

  const loadData = useCallback(async () => {
    const [loadedGroups, loadedAccounts] = await Promise.all([
      apiCall<SavingsGroup[]>("/v1/savings-groups"),
      apiCall<Account[]>("/v1/accounts"),
    ]);
    setGroups((loadedGroups ?? []).filter((group) => !group.isShareoutGroup));
    setAccounts(loadedAccounts ?? []);
  }, [apiCall]);

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load savings goals"))
      .finally(() => setLoading(false));
  }, [loadData]);

  const accountCurrencies = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.currency])),
    [accounts],
  );

  async function createGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetMinor = toMinor(form.target);
    if (targetMinor <= 0) {
      setStatus("Enter a target greater than zero.");
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      await apiCall<SavingsGroup>("/v1/savings-groups", {
        method: "POST",
        body: {
          name: form.name,
          targetMinor,
          isShareoutGroup: false,
          cycleStart: today(),
          cycleLengthMonths: 12,
          currency,
        },
      });
      setCreateOpen(false);
      setForm({ name: "", target: "" });
      await loadData();
      setStatus("Savings goal created. Transfer money into its account to make progress.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create savings goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-app content-start gap-6 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        eyebrow="Plan"
        title="Savings goals"
        subtitle="Create personal targets and track how close you are to reaching them."
        actions={<button type="button" className="primaryButton" onClick={() => setCreateOpen(true)}>New goal</button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline bg-primary-softer p-4">
        <p className="text-sm text-on-surface-soft">To fund a goal, transfer money into the savings account created for it.</p>
        <AddEntryButton className="ghostButton">Transfer money</AddEntryButton>
      </div>

      {status ? <p className="statusText">{status}</p> : null}
      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><LoadingSkeleton className="h-32" /><LoadingSkeleton className="h-32" /></div> : null}
      {!loading && groups.length === 0 ? (
        <EmptyState
          title="No personal goals yet"
          description="Create a goal for an emergency fund, school fees, travel, or anything else you are saving toward."
          action={<button type="button" className="primaryButton" onClick={() => setCreateOpen(true)}>Create your first goal</button>}
        />
      ) : null}
      {groups.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Savings goals">
          {groups.map((goal) => (
            <SavingsGoalCard
              key={goal.id}
              name={goal.name}
              currentMinor={goal.currentBalance}
              targetMinor={goal.targetMinor ?? 0}
              currency={accountCurrencies.get(goal.accountId) ?? currency}
            />
          ))}
        </section>
      ) : null}

      <FormDialog
        open={createOpen}
        title="Create savings goal"
        description="Chuma will create a dedicated savings account for this target."
        submitLabel="Create goal"
        pending={saving}
        error={status && !status.startsWith("Savings goal created") ? status : undefined}
        onSubmit={createGoal}
        onClose={() => setCreateOpen(false)}
      >
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="goalName">Goal name</label>
            <input id="goalName" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Emergency fund" required />
          </div>
          <div className="field">
            <label htmlFor="goalTarget">Target ({currency})</label>
            <input id="goalTarget" type="number" min="0.01" step="0.01" value={form.target} onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))} placeholder="0.00" required />
          </div>
        </div>
      </FormDialog>
    </main>
  );
}
