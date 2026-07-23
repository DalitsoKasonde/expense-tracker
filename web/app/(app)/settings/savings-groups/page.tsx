"use client";

import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { useUserCurrency } from "@/lib/use-user-currency";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormDialog } from "@/components/ui/dialogs";

type Account = {
  id: string;
  name: string;
  accountClass: string;
  currency: string;
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
    target: "",
    isShareoutGroup: true,
  });
  const [shareout, setShareout] = useState({
    groupId: "",
    cashAccountId: "",
    payout: "",
    cycleEnd: today(),
    note: "",
  });

  const cashAccounts = useMemo(() => accounts.filter((account) => account.accountClass !== "liability"), [accounts]);

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
      cashAccountId: current.cashAccountId || loadedAccounts?.find((account) => account.accountClass !== "liability")?.id || "",
    }));
  }, [apiCall]);

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load savings groups"))
      .finally(() => setLoading(false));
  }, [loadData]);

  function resetCreateForm() {
    setCreateOpen(false);
    setForm({ name: "", cycleStart: today(), cycleLengthMonths: "12", target: "", isShareoutGroup: true });
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
          targetMinor: form.target ? toMinor(form.target) : undefined,
          isShareoutGroup: form.isShareoutGroup,
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
            <button className="primaryButton" type="button" onClick={() => setCreateOpen(true)}>
              Create group
            </button>
            <button className="ghostButton" type="button" onClick={() => setShareoutOpen(true)} disabled={groups.length === 0 || cashAccounts.length === 0}>
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
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline text-left text-on-surface-soft">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Cycle</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Contributed</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id} className="border-b border-outline/70 last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-on-surface">{group.name}</td>
                      <td className="px-4 py-3 text-on-surface-soft">{`${new Date(group.cycleStart).toLocaleDateString()} · ${group.cycleLengthMonths} months`}</td>
                      <td className="px-4 py-3 text-on-surface">{formatMoney(group.currentBalance, userCurrency)}</td>
                      <td className="px-4 py-3 text-on-surface-soft">{formatMoney(group.contributedMinor, userCurrency)}</td>
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
        description="A savings account is created automatically for the group."
        submitLabel="Create group"
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={createGroup}
        onClose={resetCreateForm}
      >
        <div className="grid gap-4">
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </div>
          <div className="splitFields">
            <div className="field">
              <label>Cycle start</label>
              <input type="date" value={form.cycleStart} onChange={(event) => setForm((current) => ({ ...current, cycleStart: event.target.value }))} required />
            </div>
            <div className="field">
              <label>Cycle months</label>
              <input type="number" min="1" value={form.cycleLengthMonths} onChange={(event) => setForm((current) => ({ ...current, cycleLengthMonths: event.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label>Target</label>
            <input type="number" step="0.01" value={form.target} onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))} />
          </div>
          <label className="checkboxRow">
            <input type="checkbox" checked={form.isShareoutGroup} onChange={(event) => setForm((current) => ({ ...current, isShareoutGroup: event.target.checked }))} />
            Share-out group
          </label>
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
                  {account.name}
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
