"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";

type SavingsPocket = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  annualInterestRateBps?: number | null;
  currentBalanceMinor: number;
  netContributionsMinor: number;
  interestEarnedMinor: number;
};

type Account = {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
  isSavingsGroupAccount?: boolean;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((Number.parseFloat(value || "0") || 0) * 100);
}

export default function SavingsPocketsPage() {
  const apiCall = useApiCall();
  const [pockets, setPockets] = useState<SavingsPocket[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [existingAccountId, setExistingAccountId] = useState("");
  const [interestPocketId, setInterestPocketId] = useState<string | null>(null);
  const [interest, setInterest] = useState({ amount: "", date: today(), note: "" });

  const loadData = useCallback(async () => {
    const [loadedPockets, loadedAccounts] = await Promise.all([
      apiCall<SavingsPocket[]>("/v1/savings-pockets"),
      apiCall<Account[]>("/v1/accounts"),
    ]);
    setPockets(loadedPockets ?? []);
    setAccounts(loadedAccounts ?? []);
  }, [apiCall]);

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load savings pockets"))
      .finally(() => setLoading(false));
  }, [loadData]);

  const availableSavingsAccounts = useMemo(() => {
    const tracked = new Set(pockets.map((pocket) => pocket.accountId));
    return accounts.filter((account) =>
      account.accountType === "savings" &&
      account.accountClass !== "liability" &&
      !account.isSavingsGroupAccount &&
      !tracked.has(account.id),
    );
  }, [accounts, pockets]);

  async function linkExistingAccount() {
    if (!existingAccountId) return;
    setSaving(true); setStatus("");
    try {
      await apiCall("/v1/savings-pockets", { method: "POST", body: { existingAccountId } });
      setExistingAccountId("");
      await loadData();
      setStatus("Savings account added to Investments.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Failed to add savings account"); }
    finally { setSaving(false); }
  }

  async function recordInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interestPocketId) return;
    const amountMinor = toMinor(interest.amount);
    if (amountMinor <= 0) { setStatus("Enter an interest amount greater than zero."); return; }
    setSaving(true); setStatus("");
    try {
      await apiCall(`/v1/savings-pockets/${interestPocketId}/interest`, {
        method: "POST",
        body: { transactionDate: interest.date, amountMinor, note: interest.note.trim() || undefined },
      });
      setInterestPocketId(null);
      setInterest({ amount: "", date: today(), note: "" });
      await loadData();
      setStatus("Interest added to the pocket.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Failed to record interest"); }
    finally { setSaving(false); }
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Portfolio", href: "/investments" }, { label: "Savings pockets" }]} />
      <PageHeader
        eyebrow="Savings investment dashboard"
        title="Savings pockets"
        subtitle="Track interest-bearing pockets separately from spendable money and savings groups."
        actions={<Link href="/investments/add?type=pocket" className="btn btn-primary">Add savings pocket</Link>}
      />
      {status ? <p className="statusText" role="status">{status}</p> : null}

      {availableSavingsAccounts.length ? (
        <section className="card flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="field flex-1">
            <label htmlFor="existing-pocket-account">Existing savings account</label>
            <select id="existing-pocket-account" value={existingAccountId} onChange={(event) => setExistingAccountId(event.target.value)}>
              <option value="">Choose an account</option>
              {availableSavingsAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
            </select>
            <span className="field-hint">Use this for an existing Patumba or other interest-bearing savings account.</span>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!existingAccountId || saving} onClick={() => void linkExistingAccount()}>Add to Investments</button>
        </section>
      ) : null}

      {loading ? <LoadingSkeleton className="h-52" /> : pockets.length === 0 ? (
        <EmptyState title="No savings pockets" description="Create a pocket here, or first create a savings account and add it to Investments." action={<Link href="/investments/add?type=pocket" className="btn btn-primary">Add savings pocket</Link>} />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {pockets.map((pocket) => {
            const returnPercent = pocket.netContributionsMinor > 0
              ? (pocket.interestEarnedMinor / pocket.netContributionsMinor) * 100
              : null;
            return (
              <article key={pocket.id} className="card grid gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="sectionKicker">Interest-bearing savings</p><h2 className="mt-1 text-xl font-semibold text-on-surface">{pocket.name}</h2></div>
                  {pocket.annualInterestRateBps != null ? <span className="metaBadge">{(pocket.annualInterestRateBps / 100).toFixed(2)}% p.a.</span> : null}
                </div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Current value</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums text-on-surface">{formatMoney(pocket.currentBalanceMinor, pocket.currency)}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-surface-soft p-3"><p className="text-xs text-on-surface-soft">Net contributions</p><strong className="tabular-nums">{formatMoney(pocket.netContributionsMinor, pocket.currency)}</strong></div>
                  <div className="rounded-md bg-positive-soft p-3"><p className="text-xs text-positive">Interest earned</p><strong className="tabular-nums text-positive">+{formatMoney(pocket.interestEarnedMinor, pocket.currency)}{returnPercent == null ? "" : ` · ${returnPercent.toFixed(2)}%`}</strong></div>
                </div>
                {interestPocketId === pocket.id ? (
                  <form className="settingsGrid" onSubmit={(event) => void recordInterest(event)}>
                    <div className="splitFields"><div className="field"><label htmlFor={`interest-amount-${pocket.id}`}>Interest amount ({pocket.currency})</label><input id={`interest-amount-${pocket.id}`} type="number" min="0.01" step="0.01" value={interest.amount} onChange={(event) => setInterest((current) => ({ ...current, amount: event.target.value }))} required /></div><div className="field"><label htmlFor={`interest-date-${pocket.id}`}>Credited date</label><input id={`interest-date-${pocket.id}`} type="date" value={interest.date} onChange={(event) => setInterest((current) => ({ ...current, date: event.target.value }))} required /></div></div>
                    <div className="field"><label htmlFor={`interest-note-${pocket.id}`}>Note</label><input id={`interest-note-${pocket.id}`} value={interest.note} onChange={(event) => setInterest((current) => ({ ...current, note: event.target.value }))} placeholder="e.g. Patumba monthly interest" /></div>
                    <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={saving}>Save interest</button><button className="btn btn-ghost" type="button" onClick={() => setInterestPocketId(null)}>Cancel</button></div>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2"><button className="btn btn-primary" type="button" onClick={() => setInterestPocketId(pocket.id)}>Add interest</button><Link className="btn btn-ghost" href="/add">Transfer money</Link><Link className="btn btn-ghost" href="/settings/accounts">Edit account</Link></div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}
