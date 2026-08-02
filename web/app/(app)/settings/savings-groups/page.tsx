"use client";

import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { useUserCurrency } from "@/lib/use-user-currency";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormDialog } from "@/components/ui/dialogs";
import { isSpendableAccount, spendableAccounts } from "@/lib/spendable-accounts";

type Account = {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
  isSavingsGroupAccount?: boolean;
};

type SavingsGroup = {
  id: string;
  accountId: string;
  name: string;
  isShareoutGroup: boolean;
  cycleStart: string;
  cycleLengthMonths: number;
  status: string;
  targetMinor?: number | null;
  contributedMinor: number;
  currentBalance: number;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

export default function SavingsGroupsSettingsPage() {
  const apiCall = useApiCall();
  const { currency: userCurrency } = useUserCurrency();
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shareoutOpen, setShareoutOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    cycleStart: today(),
    cycleLengthMonths: "12",
    openingContribution: "",
  });
  const [shareout, setShareout] = useState({
    groupId: "",
    cashAccountId: "",
    payout: "",
    cycleEnd: today(),
    note: "",
  });

  const cashAccounts = useMemo(() => spendableAccounts(accounts), [accounts]);

  const loadData = useCallback(async () => {
    const [loadedGroups, loadedAccounts] = await Promise.all([
      apiCall<SavingsGroup[]>("/v1/savings-groups"),
      apiCall<Account[]>("/v1/accounts"),
    ]);
    const shareoutGroups = (loadedGroups ?? []).filter((group) => group.isShareoutGroup);
    setGroups(shareoutGroups);
    setAccounts(loadedAccounts ?? []);
    setShareout((current) => ({
      ...current,
      groupId: current.groupId || shareoutGroups[0]?.id || "",
      cashAccountId: current.cashAccountId || loadedAccounts?.find(isSpendableAccount)?.id || "",
    }));
  }, [apiCall]);

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load savings groups"))
      .finally(() => setLoading(false));
  }, [loadData]);

  function resetCreateForm() {
    setCreateOpen(false);
    setForm({ name: "", cycleStart: today(), cycleLengthMonths: "12", openingContribution: "" });
  }

  function resetShareoutForm() {
    setShareoutOpen(false);
    setShareout((current) => ({ ...current, payout: "", note: "" }));
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await apiCall<SavingsGroup>("/v1/savings-groups", {
        method: "POST",
        body: {
          name: form.name,
          cycleStart: form.cycleStart,
          cycleLengthMonths: Number(form.cycleLengthMonths) || 12,
          openingContributionMinor: form.openingContribution ? toMinor(form.openingContribution) : 0,
          isShareoutGroup: true,
          currency: userCurrency,
        },
      });
      resetCreateForm();
      await loadData();
      setStatus("Savings group created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create savings group");
    } finally {
      setSaving(false);
    }
  }

  async function closeCycle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await apiCall(`/v1/savings-groups/${shareout.groupId}/shareout`, {
        method: "POST",
        body: {
          cashAccountId: shareout.cashAccountId,
          payoutMinor: toMinor(shareout.payout),
          cycleEnd: shareout.cycleEnd,
          note: shareout.note || undefined,
          currency: userCurrency,
        },
      });
      resetShareoutForm();
      await loadData();
      setStatus("Share-out recorded and cycle rolled forward.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to close cycle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="resourceBody">
            <strong>Groups</strong>
            <span className="muted">Current balance and cycle contributions are shown separately.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
              Create group
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShareoutOpen(true)} disabled={groups.length === 0 || cashAccounts.length === 0}>
              Record share-out
            </button>
          </div>
        </div>

        <section className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <strong>Groups table</strong>
          </div>
          <div className="overflow-x-auto">
            {loading ? <div className="muted">Loading groups...</div> : null}
            {!loading && groups.length === 0 ? <div className="muted">No savings groups yet.</div> : null}
            {groups.length ? (
              <table className="dataTable">
                <thead>
                  <tr className="text-on-surface-soft">
                    <th className="font-semibold">Name</th>
                    <th className="font-semibold">Cycle</th>
                    <th className="font-semibold">Balance</th>
                    <th className="font-semibold">Contributed</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td data-label="Name" className="font-semibold text-on-surface">{group.name}</td>
                      <td data-label="Cycle" className="text-on-surface-soft">{`${new Date(group.cycleStart).toLocaleDateString()} · ${group.cycleLengthMonths} months`}</td>
                      <td data-label="Balance" className="text-on-surface">{formatMoney(group.currentBalance, userCurrency)}</td>
                      <td data-label="Contributed" className="text-on-surface-soft">{formatMoney(group.contributedMinor, userCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </div>

      {status ? <p className="statusText">{status}</p> : null}

      <FormDialog
        open={createOpen}
        title="Create group"
        description="Create a share-out cycle. A savings account is created automatically for the group."
        submitLabel="Create group"
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={createGroup}
        onClose={resetCreateForm}
      >
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="group-name">Group name</label>
            <input id="group-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </div>
          <div className="splitFields">
            <div className="field">
              <label htmlFor="group-cycle-start">Cycle start</label>
              <input id="group-cycle-start" type="date" value={form.cycleStart} onChange={(event) => setForm((current) => ({ ...current, cycleStart: event.target.value }))} required />
            </div>
            <div className="field">
              <label htmlFor="group-cycle-months">Months before share-out</label>
              <input id="group-cycle-months" type="number" min="1" value={form.cycleLengthMonths} onChange={(event) => setForm((current) => ({ ...current, cycleLengthMonths: event.target.value }))} />
              <span className="muted">How long members contribute before the group pays out.</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="group-opening-contribution">Amount already contributed (optional)</label>
            <input
              id="group-opening-contribution"
              type="number"
              min="0"
              step="0.01"
              value={form.openingContribution}
              placeholder="0.00"
              onChange={(event) => setForm((current) => ({ ...current, openingContribution: event.target.value }))}
            />
            <span className="muted">Records savings from before Expenses without reducing any cash account.</span>
          </div>
        </div>
      </FormDialog>

      <FormDialog
        open={shareoutOpen}
        title="Record share-out"
        description="Payout minus contributions becomes gain or loss."
        submitLabel="Record share-out"
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={closeCycle}
        onClose={resetShareoutForm}
      >
        <div className="grid gap-4">
          <div className="field">
            <label>Group</label>
            <select value={shareout.groupId} onChange={(event) => setShareout((current) => ({ ...current, groupId: event.target.value }))} required>
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cash account</label>
            <select value={shareout.cashAccountId} onChange={(event) => setShareout((current) => ({ ...current, cashAccountId: event.target.value }))} required>
              <option value="">Select account</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
          <div className="splitFields">
            <div className="field">
              <label>Net payout</label>
              <input type="number" step="0.01" value={shareout.payout} onChange={(event) => setShareout((current) => ({ ...current, payout: event.target.value }))} required />
            </div>
            <div className="field">
              <label>Cycle end</label>
              <input type="date" value={shareout.cycleEnd} onChange={(event) => setShareout((current) => ({ ...current, cycleEnd: event.target.value }))} required />
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <input value={shareout.note} onChange={(event) => setShareout((current) => ({ ...current, note: event.target.value }))} />
          </div>
        </div>
      </FormDialog>
    </section>
  );
}
