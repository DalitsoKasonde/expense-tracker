"use client";

import { useApiCall } from "@/lib/client-api";
import { useEffect, useMemo, useState } from "react";

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

function formatMoney(value: number) {
  return `ZMW ${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SavingsGroupsSettingsPage() {
  const apiCall = useApiCall();
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function loadData() {
    const [loadedGroups, loadedAccounts] = await Promise.all([
      apiCall<SavingsGroup[]>("/v1/savings-groups"),
      apiCall<Account[]>("/v1/accounts"),
    ]);
    setGroups(loadedGroups ?? []);
    setAccounts(loadedAccounts ?? []);
    setShareout((current) => ({
      ...current,
      groupId: current.groupId || loadedGroups?.[0]?.id || "",
      cashAccountId: current.cashAccountId || loadedAccounts?.find((account) => account.accountClass !== "liability")?.id || "",
    }));
  }

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load savings groups"))
      .finally(() => setLoading(false));
  }, [apiCall]);

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
          currency: "ZMW",
        },
      });
      setForm({ name: "", cycleStart: today(), cycleLengthMonths: "12", target: "", isShareoutGroup: true });
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
          currency: "ZMW",
        },
      });
      setShareout((current) => ({ ...current, payout: "", note: "" }));
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
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Savings Groups</p>
        <h2 className="sectionHeading">Share-out cycles</h2>
        <p className="muted">Contributions stay as savings. Share-out records return of capital plus gain or loss.</p>
      </div>

      <div className="settingsDetailGrid">
        <form className="card settingsFormPanel" onSubmit={createGroup}>
          <div className="resourceBody">
            <strong>Create group</strong>
            <span className="muted">A savings account is created automatically for the group.</span>
          </div>
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
          <button className="primaryButton" type="submit" disabled={saving}>
            Create group
          </button>
        </form>

        <form className="card settingsFormPanel" onSubmit={closeCycle}>
          <div className="resourceBody">
            <strong>Record share-out</strong>
            <span className="muted">Payout minus contributions becomes gain or loss.</span>
          </div>
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
          <button className="primaryButton" type="submit" disabled={saving || groups.length === 0 || cashAccounts.length === 0}>
            Record share-out
          </button>
        </form>
      </div>

      <section className="card settingsListPanel">
        <div className="resourceBody">
          <strong>Groups</strong>
          <span className="muted">Current balance and cycle contributions are shown separately.</span>
        </div>
        <div className="resourceList">
          {loading ? <div className="muted">Loading groups...</div> : null}
          {!loading && groups.length === 0 ? <div className="muted">No savings groups yet.</div> : null}
          {groups.map((group) => (
            <div key={group.id} className="resourceRow">
              <div className="resourceBody">
                <strong>{group.name}</strong>
                <div className="resourceMeta">
                  <span className="metaBadge">Started {new Date(group.cycleStart).toLocaleDateString()}</span>
                  <span className="metaBadge">{group.cycleLengthMonths} months</span>
                </div>
              </div>
              <div className="resourceBody">
                <strong>{formatMoney(group.currentBalance)}</strong>
                <span className="muted">Contributed {formatMoney(group.contributedMinor)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {status ? <p className="statusText">{status}</p> : null}
    </section>
  );
}
