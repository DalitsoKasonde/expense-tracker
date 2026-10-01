"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Card, EmptyState, LoadingSkeleton, Money, PageHeader, buttonClass } from "@/components/ui";
import { buildCategoryRows, type Category } from "@/lib/category-tree";
import {
  editRow,
  isBlankRow,
  loadDraft,
  localDate,
  nextRow,
  rowPayload,
  rowProblem,
  saveDraft,
  sheetTotals,
  type CatchUpRow,
} from "@/lib/catch-up";
import { useApiCall } from "@/lib/client-api";
import { notifyEntriesChanged } from "@/lib/entries-bus";
import { recallAccountForEntryKind, rememberAccountForEntryKind, rememberFeeForAccount } from "@/lib/entry-preferences";
import { spendableAccounts } from "@/lib/spendable-accounts";
import { CatchUpRowEditor, type CatchUpAccountOption } from "./catch-up-row";
import { ReconcileBalance } from "./reconcile-balance";
import { SmsPaste } from "./sms-paste";

type SaveSummary = { saved: number; failed: number; alreadyRecorded: number };

/**
 * The server's answer when a key it has seen arrives with a different body.
 *
 * Row ids are keys, and an SMS row's id comes from its transaction reference,
 * so this means the message was saved on an earlier evening — possibly with a
 * category added since. It is already in the record, not a failure.
 */
function isAlreadyRecorded(message: string) {
  return /idempotency key reused/i.test(message);
}

export function CatchUpSheet() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accounts, setAccounts] = useState<CatchUpAccountOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<CatchUpRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  // Set when a row is added from the keyboard, so typing can carry straight on
  // into the new row's amount without reaching for the mouse.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    let ignore = false;
    async function load() {
      try {
        const api = apiCallRef.current;
        const [loadedAccounts, loadedCategories] = await Promise.all([
          api<CatchUpAccountOption[]>("/v1/accounts"),
          api<Category[]>("/v1/categories").catch(() => []),
        ]);
        if (ignore) return;
        const spendable = spendableAccounts(loadedAccounts ?? []);
        setAccounts(spendable);
        setCategories(loadedCategories ?? []);
        const remembered = recallAccountForEntryKind("expense_living");
        const defaultAccount = spendable.find((account) => account.id === remembered) ?? spendable[0];
        const draft = loadDraft();
        setRows(draft.length ? draft : [nextRow(undefined, { date: localDate(), accountId: defaultAccount?.id ?? "" })]);
      } catch (reason) {
        if (!ignore) setLoadError(reason instanceof Error ? reason.message : "Could not load your accounts");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!loading) saveDraft(rows);
  }, [loading, rows]);

  useEffect(() => {
    if (!focusRowId) return;
    document.querySelector<HTMLInputElement>(`[data-catch-up-amount="${focusRowId}"]`)?.focus();
    setFocusRowId(null);
  }, [focusRowId]);

  const categoryRows = useMemo(() => buildCategoryRows(categories), [categories]);
  const totals = useMemo(() => sheetTotals(rows.filter((row) => !isBlankRow(row)), accounts), [rows, accounts]);
  const pendingCount = rows.filter((row) => !isBlankRow(row)).length;

  function addRow(after?: CatchUpRow) {
    const row = nextRow(after ?? rows[rows.length - 1], { date: localDate(), accountId: accounts[0]?.id ?? "" });
    setRows((current) => {
      const index = after ? current.findIndex((item) => item.id === after.id) : current.length - 1;
      return [...current.slice(0, index + 1), row, ...current.slice(index + 1)];
    });
    setFocusRowId(row.id);
  }

  function importRows(incoming: CatchUpRow[]) {
    const present = new Set(rows.map((row) => row.id));
    const fresh = incoming.filter((row) => !present.has(row.id));
    if (fresh.length) {
      setRows((current) => [...current.filter((row) => !isBlankRow(row)), ...fresh]);
      setSummary(null);
    }
    return fresh.length;
  }

  function updateRow(id: string, patch: Parameters<typeof editRow>[1]) {
    setRows((current) => current.map((row) => (row.id === id ? editRow(row, patch, categories) : row)));
    setSummary(null);
  }

  function removeRow(id: string) {
    setRows((current) => {
      const remaining = current.filter((row) => row.id !== id);
      return remaining.length ? remaining : [nextRow(current[0], { date: localDate(), accountId: accounts[0]?.id ?? "" })];
    });
  }

  // Enter moves down the sheet instead of submitting anything: on the last row
  // it starts a new one, otherwise it jumps to the next row's amount.
  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, row: CatchUpRow) {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    const index = rows.findIndex((item) => item.id === row.id);
    const below = rows[index + 1];
    if (below) setFocusRowId(below.id);
    else addRow(row);
  }

  async function saveAll() {
    setSaving(true);
    setSummary(null);
    const today = localDate();
    let saved = 0;
    let failed = 0;
    let alreadyRecorded = 0;
    let lastSaved: CatchUpRow | undefined;

    // One after another rather than in parallel: a backlog can be dozens of
    // rows, and the server is a small shared host. Each row is its own request
    // through the ordinary endpoint, so fees, currency checks and validation
    // are exactly those of a single entry.
    for (const row of rows) {
      if (isBlankRow(row)) continue;
      const problem = rowProblem(row, accounts, today);
      if (problem) {
        failed += 1;
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, error: problem } : item)));
        continue;
      }
      try {
        const payload = rowPayload(row, accounts);
        await apiCallRef.current("/v1/transactions", {
          method: "POST",
          body: payload,
          // The row id is stable across retries, so a save whose response was
          // lost (a dropped mobile connection) cannot be recorded twice.
          headers: { "X-Idempotency-Key": `catch-up:${row.id}` },
        });
        saved += 1;
        lastSaved = row;
        rememberAccountForEntryKind(row.kind, row.accountId);
        rememberFeeForAccount(row.accountId, payload.transactionFee ?? 0);
        setRows((current) => current.filter((item) => item.id !== row.id));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Could not save this entry";
        if (isAlreadyRecorded(message)) {
          alreadyRecorded += 1;
          setRows((current) => current.filter((item) => item.id !== row.id));
          continue;
        }
        failed += 1;
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, error: message } : item)));
      }
    }

    setRows((current) => {
      const remaining = current.filter((row) => !isBlankRow(row) || row.error);
      return remaining.length ? remaining : [nextRow(lastSaved, { date: localDate(), accountId: accounts[0]?.id ?? "" })];
    });
    if (saved) {
      notifyEntriesChanged();
      router.refresh();
    }
    setSummary({ saved, failed, alreadyRecorded });
    setSaving(false);
  }

  const header = (
    <PageHeader
      eyebrow="Add"
      title="Catch up"
      subtitle="Enter a run of past spending in one go. Each new row keeps the date and account of the one above, and Enter moves you down the sheet."
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <LoadingSkeleton className="h-40" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        {header}
        <div role="alert" className="rounded-md border border-negative/30 bg-negative-soft p-4 text-sm text-negative">{loadError}</div>
      </>
    );
  }

  if (!accounts.length) {
    return (
      <>
        {header}
        <EmptyState
          title="Add an account first"
          description="Every entry is paid from, or received into, an account."
          action={<Link href="/settings/accounts" className={buttonClass()}>Go to Accounts</Link>}
        />
      </>
    );
  }

  return (
    <>
      {header}

      <SmsPaste accounts={accounts} onImport={importRows} />

      <div className="grid gap-3">
        {rows.map((row, index) => (
          <CatchUpRowEditor
            key={row.id}
            row={row}
            position={index + 1}
            accounts={accounts}
            categories={categoryRows}
            disabled={saving}
            onChange={(patch) => updateRow(row.id, patch)}
            onRemove={() => removeRow(row.id)}
            onKeyDown={(event) => handleRowKeyDown(event, row)}
          />
        ))}
      </div>

      <Button variant="ghost" className="sm:justify-self-start" onClick={() => addRow()} disabled={saving}>
        + Add row
      </Button>

      <Card className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-1 text-sm text-on-surface">
          <p className="font-semibold">
            {pendingCount} {pendingCount === 1 ? "entry" : "entries"} ready
          </p>
          {totals.map((total) => (
            <p key={total.currency} className="text-on-surface-soft">
              Spent <Money amountMinor={total.spent} currency={total.currency} />
              {total.received ? <> · received <Money amountMinor={total.received} currency={total.currency} /></> : null}
              {total.fees ? <> · fees <Money amountMinor={total.fees} currency={total.currency} /></> : null}
            </p>
          ))}
          <p aria-live="polite" className="text-on-surface-soft">
            {summary ? describeSummary(summary) : null}
          </p>
        </div>
        <Button onClick={() => void saveAll()} disabled={saving || pendingCount === 0}>
          {saving ? "Saving…" : `Save ${pendingCount || ""} ${pendingCount === 1 ? "entry" : "entries"}`.replace(/\s+/g, " ")}
        </Button>
      </Card>

      <ReconcileBalance accounts={accounts} unsavedCount={pendingCount} />
    </>
  );
}

function describeSummary({ saved, failed, alreadyRecorded }: SaveSummary) {
  const parts: string[] = [];
  if (saved) parts.push(`Saved ${saved} ${saved === 1 ? "entry" : "entries"}.`);
  if (alreadyRecorded) parts.push(`${alreadyRecorded} ${alreadyRecorded === 1 ? "was" : "were"} already recorded from an earlier paste.`);
  if (failed) parts.push(`${failed} ${failed === 1 ? "needs" : "need"} attention below.`);
  return parts.join(" ") || "Nothing to save.";
}
