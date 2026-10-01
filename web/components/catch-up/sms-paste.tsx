"use client";

import { useState } from "react";
import { Button, Card, Field, Money, Select, Textarea } from "@/components/ui";
import type { CatchUpRow } from "@/lib/catch-up";
import { latestReportedBalance, parseMomoText, rowFromMomoMessage } from "@/lib/momo-sms";
import type { CatchUpAccountOption } from "./catch-up-row";

type ImportReport = {
  added: number;
  alreadyOnSheet: number;
  wrongCurrency: number;
  unread: string[];
  balance: ReturnType<typeof latestReportedBalance>;
  accountName: string;
};

type SmsPasteProps = {
  accounts: CatchUpAccountOption[];
  /** Adds rows the sheet does not already hold; returns how many it added. */
  onImport: (rows: CatchUpRow[]) => number;
};

/** The wallet the messages most likely came from: the one named after the network. */
function airtelAccount(accounts: CatchUpAccountOption[]) {
  return accounts.find((account) => /airtel/i.test(account.name)) ?? accounts[0];
}

export function SmsPaste({ accounts, onImport }: SmsPasteProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(() => airtelAccount(accounts)?.id ?? "");
  const [report, setReport] = useState<ImportReport | null>(null);

  function read() {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    const { messages, unread } = parseMomoText(text);
    // A message in another currency than the wallet would be saved in the
    // wallet's currency and silently misstate it, so it is left out.
    const matching = messages.filter((message) => message.currency === account.currency);
    const rows = matching.map((message) => rowFromMomoMessage(message, account.id));
    const added = onImport(rows);
    setReport({
      added,
      alreadyOnSheet: rows.length - added,
      wrongCurrency: messages.length - matching.length,
      unread,
      balance: latestReportedBalance(matching),
      accountName: account.name,
    });
    if (added) setText("");
  }

  if (!open) {
    return (
      <Button variant="ghost" className="sm:justify-self-start" onClick={() => setOpen(true)}>
        Paste Airtel Money SMS
      </Button>
    );
  }

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold text-on-surface">Paste Airtel Money SMS</h2>
        <p className="mt-1 text-sm text-on-surface-soft">
          One message per line. They are read on this device and only the entries are saved — the messages themselves never leave your phone or computer.
        </p>
      </div>
      <Field label="Messages">
        {(props) => (
          <Textarea {...props} rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="Payment of ZMW 10.00 Till Number … TID : MP260923.2136.G64740." />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Wallet">
          {(props) => (
            <Select {...props} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={read} disabled={!text.trim() || !accountId}>Add to sheet</Button>
        </div>
      </div>

      {report ? (
        <div className="grid gap-2 text-sm text-on-surface" aria-live="polite">
          <p>
            Added {report.added} {report.added === 1 ? "entry" : "entries"} to the sheet
            {report.alreadyOnSheet ? `; ${report.alreadyOnSheet} ${report.alreadyOnSheet === 1 ? "was" : "were"} already on it` : ""}.
            {report.added ? " Check each one and add a category and any fee before saving." : ""}
          </p>
          {report.added ? (
            <p className="text-on-surface-soft">
              Money received is added as income. If it came from your own bank account, remove that row — it is a transfer, not income.
            </p>
          ) : null}
          {report.wrongCurrency ? (
            <p className="text-on-surface-soft">
              {report.wrongCurrency} {report.wrongCurrency === 1 ? "message is" : "messages are"} in another currency than {report.accountName} and {report.wrongCurrency === 1 ? "was" : "were"} left out.
            </p>
          ) : null}
          {report.balance ? (
            <p className="text-on-surface-soft">
              Latest balance in these messages: <Money amountMinor={report.balance.balanceMinor} currency={report.balance.currency} /> on{" "}
              {new Date(`${report.balance.date}T${report.balance.time}`).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Once everything up to then is saved, {report.accountName} should show the same.
            </p>
          ) : null}
          {report.unread.length ? (
            <details>
              <summary className="cursor-pointer text-on-surface-soft">
                {report.unread.length} {report.unread.length === 1 ? "line" : "lines"} not recognised as a transaction
              </summary>
              <ul className="mt-2 grid gap-1 text-on-surface-soft">
                {report.unread.map((line, index) => (
                  <li key={`${index}-${line}`} className="break-words">{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
