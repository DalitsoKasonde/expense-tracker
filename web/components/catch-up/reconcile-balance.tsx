"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Input, Money, Select } from "@/components/ui";
import { parseAmountMinor } from "@/lib/catch-up";
import { localDate } from "@/lib/date-terms";
import { useApiCall } from "@/lib/client-api";
import { notifyEntriesChanged, useEntriesChanged } from "@/lib/entries-bus";
import { reconcile, unaccountedSpendingPayload } from "@/lib/reconcile";
import type { UnifiedDashboardData } from "@/lib/use-unified-dashboard";
import type { CatchUpAccountOption } from "./catch-up-row";

type ReconcileBalanceProps = {
  accounts: CatchUpAccountOption[];
  /** Rows still on the sheet; they are not in the tracked balance yet. */
  unsavedCount: number;
};

/** Signed, because an overdrawn wallet is a real balance to reconcile to. */
function parseBalanceMinor(value: string) {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const magnitude = parseAmountMinor(negative ? trimmed.slice(1) : trimmed);
  return magnitude === null ? null : negative ? -magnitude : magnitude;
}

export function ReconcileBalance({ accounts, unsavedCount }: ReconcileBalanceProps) {
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [trackedMinor, setTrackedMinor] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actual, setActual] = useState("");
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  const account = accounts.find((item) => item.id === accountId);

  useEffect(() => {
    if (!account) return;
    let ignore = false;
    setTrackedMinor(null);
    setLoadError("");
    // Balances come from the dashboard so they are computed by exactly the
    // expression every other screen uses, fees and transfers included.
    apiCallRef.current<UnifiedDashboardData>(`/v1/dashboard/unified?currency=${encodeURIComponent(account.currency)}`)
      .then((dashboard) => {
        if (ignore) return;
        const balance = dashboard?.accountBalances?.find((item) => item.accountId === account.id);
        if (balance) setTrackedMinor(balance.balanceMinor);
        else setLoadError("Could not find this account's balance.");
      })
      .catch((reason) => {
        if (!ignore) setLoadError(reason instanceof Error ? reason.message : "Could not load the balance");
      });
    return () => {
      ignore = true;
    };
  }, [account, reloadNonce]);

  // Saving the sheet changes the tracked balance under this panel.
  useEntriesChanged(useCallback(() => setReloadNonce((nonce) => nonce + 1), []));

  const actualMinor = parseBalanceMinor(actual);
  const result = trackedMinor !== null && actualMinor !== null ? reconcile(trackedMinor, actualMinor) : null;

  async function recordShortfall() {
    if (!account || result?.outcome !== "shortfall") return;
    setRecording(true);
    setMessage("");
    try {
      await apiCallRef.current("/v1/transactions", {
        method: "POST",
        body: unaccountedSpendingPayload(account, result.amountMinor, localDate()),
      });
      setActual("");
      setMessage(`Recorded. ${account.name} now matches what it actually holds.`);
      notifyEntriesChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not record the difference");
    } finally {
      setRecording(false);
    }
  }

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold text-on-surface">Match an account to its real balance</h2>
        <p className="mt-1 text-sm text-on-surface-soft">
          When you have entered everything you can find, check the account&apos;s balance in your wallet or banking app. Whatever is missing can be recorded as one line of unaccounted spending, so the balance is right from today.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account">
          {(props) => (
            <Select {...props} value={accountId} onChange={(event) => { setAccountId(event.target.value); setMessage(""); }}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={account ? `Actual balance now (${account.currency})` : "Actual balance now"}
          error={actual.trim() && actualMinor === null ? "Enter the balance as a number, like 100.76." : undefined}
        >
          {(props) => (
            <Input {...props} inputMode="decimal" autoComplete="off" placeholder="0.00" value={actual} onChange={(event) => { setActual(event.target.value); setMessage(""); }} />
          )}
        </Field>
      </div>

      <div className="grid gap-2 text-sm text-on-surface" aria-live="polite">
        {loadError ? <p className="text-negative">{loadError}</p> : null}
        {account && trackedMinor !== null ? (
          <p>
            The app has <Money amountMinor={trackedMinor} currency={account.currency} /> in {account.name} today.
          </p>
        ) : null}
        {account && result?.outcome === "match" ? <p>It matches — nothing is missing.</p> : null}
        {account && result?.outcome === "shortfall" ? (
          <p>
            <Money amountMinor={result.amountMinor} currency={account.currency} /> left the account without being recorded.
          </p>
        ) : null}
        {account && result?.outcome === "surplus" ? (
          <p className="text-on-surface-soft">
            The account holds <Money amountMinor={result.amountMinor} currency={account.currency} /> more than the app expects. That usually means money received was not entered, or a payment was entered twice — check Activity rather than recording a guess.
          </p>
        ) : null}
        {unsavedCount > 0 && result?.outcome === "shortfall" ? (
          <p className="text-on-surface-soft">
            Save the {unsavedCount} {unsavedCount === 1 ? "entry" : "entries"} on the sheet first; until then they are not part of the balance above.
          </p>
        ) : null}
        {message ? <p>{message}</p> : null}
      </div>

      {result?.outcome === "shortfall" && account ? (
        <Button className="sm:justify-self-start" onClick={() => void recordShortfall()} disabled={recording || unsavedCount > 0}>
          {recording ? "Recording…" : "Record as unaccounted spending"}
        </Button>
      ) : null}
    </Card>
  );
}
