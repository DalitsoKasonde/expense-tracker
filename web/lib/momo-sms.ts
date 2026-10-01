/**
 * Reads pasted mobile-money SMS into entries.
 *
 * The SMS inbox is the one complete record of mobile-money spending most
 * people have, so a backlog is usually rebuilt from it. Parsing happens here,
 * in the browser, on purpose: the raw text names people and numbers and never
 * needs to reach the server — only the entries built from it do.
 *
 * Only formats seen in real messages are recognised. A message that matches
 * none of them is reported back as unread rather than guessed at, since a
 * misread amount saved into the record is worse than one typed by hand.
 * Airtel Money only for now; MTN is added when real samples are available.
 */

import { parseAmountMinor, type CatchUpRow } from "./catch-up";

export type MomoMessage = {
  network: "airtel";
  /** The transaction ID; unique per movement, so it doubles as a dedupe key. */
  reference: string;
  direction: "out" | "in";
  amountMinor: number;
  currency: string;
  /** Who was paid or who paid; empty when the message does not say. */
  counterparty: string;
  /** YYYY-MM-DD, taken from the transaction ID. */
  date: string;
  /** HH:MM, for ordering messages from the same day. */
  time: string;
  /** The wallet balance the message reports after this movement. */
  balanceMinor: number | null;
};

export type MomoParseResult = {
  messages: MomoMessage[];
  /** Lines that looked like none of the known formats. */
  unread: string[];
};

const AMOUNT = String.raw`(?<currency>[A-Z]{3})\s*(?<amount>[\d,]+(?:\.\d{1,2})?)`;

// Airtel IDs are two letters, then YYMMDD.HHMM, then a suffix: MP260923.2136.G64740.
// Pasted SMS usually lose the phone's timestamp, so the ID is the date.
const AIRTEL_ID = /\b(?:Txn\.?\s*ID|TID)\s*:\s*([A-Z]{2}(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})\.[A-Z0-9]+)/i;

const AIRTEL_FORMATS: { direction: MomoMessage["direction"]; pattern: RegExp }[] = [
  // "Payment to AMMOBILE Account NA of ZMW 15.00 is successful."
  { direction: "out", pattern: new RegExp(String.raw`Payment to (?<counterparty>.+?) of ${AMOUNT} is successful`, "i") },
  // "Payment of ZMW 10.00 Till Number SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE. Airtel Money bal is …"
  { direction: "out", pattern: new RegExp(String.raw`Payment of ${AMOUNT}\s+Till Number\s+(?<counterparty>.+?)\.\s*Airtel Money bal`, "i") },
  // "You have received ZMW 100.00 from .Dial *115#…" and, with no decimals,
  // "You have received ZMW 60.Dial *115#…" — the sender is often left blank.
  { direction: "in", pattern: new RegExp(String.raw`You have received ${AMOUNT}\.?\s*(?:from\s*(?<counterparty>.*?))?\.?\s*Dial\b`, "i") },
];

const AIRTEL_BALANCE = new RegExp(String.raw`bal(?:ance)?\s+is\s+${AMOUNT}`, "i");

function validDate(year: string, month: string, day: string) {
  const date = new Date(Date.UTC(2000 + Number(year), Number(month) - 1, Number(day)));
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

function tidy(counterparty: string | undefined) {
  return (counterparty ?? "").replace(/^[\s.]+|[\s.]+$/g, "").replace(/\s+/g, " ");
}

export function parseAirtelMessage(text: string): MomoMessage | null {
  const id = AIRTEL_ID.exec(text);
  if (!id) return null;
  const [, reference, year, month, day, hour, minute] = id;
  if (!validDate(year, month, day)) return null;

  for (const format of AIRTEL_FORMATS) {
    const groups = format.pattern.exec(text)?.groups;
    if (!groups) continue;
    const amountMinor = parseAmountMinor(groups.amount);
    if (amountMinor === null || amountMinor <= 0) return null;
    const balance = AIRTEL_BALANCE.exec(text);
    return {
      network: "airtel",
      reference: reference.toUpperCase(),
      direction: format.direction,
      amountMinor,
      currency: groups.currency.toUpperCase(),
      counterparty: tidy(groups.counterparty),
      date: `20${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
      balanceMinor: balance?.groups ? parseAmountMinor(balance.groups.amount) : null,
    };
  }
  return null;
}

/**
 * Every message in a paste, oldest first, each reference once.
 *
 * One message per line is how SMS come out of a phone's copy or export; blank
 * lines between them are ignored.
 */
export function parseMomoText(text: string): MomoParseResult {
  const byReference = new Map<string, MomoMessage>();
  const unread: string[] = [];
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const message = parseAirtelMessage(line);
    if (message) byReference.set(message.reference, message);
    else unread.push(line);
  }
  const messages = [...byReference.values()].sort((left, right) =>
    `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`),
  );
  return { messages, unread };
}

/**
 * The most recent balance the messages report, per currency.
 *
 * This is what the wallet actually held at that moment, so it is the figure to
 * reconcile the tracked balance against.
 */
export function latestReportedBalance(messages: MomoMessage[]) {
  const latest = [...messages].reverse().find((message) => message.balanceMinor !== null);
  return latest ? { balanceMinor: latest.balanceMinor as number, currency: latest.currency, date: latest.date, time: latest.time } : null;
}

/** Minor units back to the text a sheet cell holds, without a float. */
function amountText(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/**
 * A catch-up row for one message.
 *
 * The row id is derived from the transaction reference, and the id is the
 * save's idempotency key, so the same SMS pasted on two evenings is refused by
 * the server the second time instead of being recorded twice.
 */
export function rowFromMomoMessage(message: MomoMessage, accountId: string): CatchUpRow {
  const who = message.counterparty || (message.direction === "in" ? "Airtel Money received" : "Airtel Money payment");
  return {
    id: `sms-${message.reference}`,
    kind: message.direction === "in" ? "income_earned" : "expense_living",
    transactionDate: message.date,
    amount: amountText(message.amountMinor),
    accountId,
    categoryId: "",
    transactionFee: "",
    note: `${who} · Ref ${message.reference}`,
  };
}
