/**
 * The catch-up sheet: many everyday entries typed in one sitting.
 *
 * Falling behind is what ends most tracking habits, and the add-entry dialog
 * makes catching up expensive — one dialog, one kind picker and one save per
 * payment. The sheet keeps only what everyday spending needs and lets each row
 * inherit the date and account from the one above, because a backlog is
 * entered in runs: a day at a time, off one statement at a time.
 *
 * Everything here is pure so the rules can be tested without a browser.
 */

export type CatchUpKind = "expense_living" | "income_earned";

export type CatchUpRow = {
  /** Also the row's idempotency key, so a retried save cannot post twice. */
  id: string;
  kind: CatchUpKind;
  transactionDate: string;
  amount: string;
  accountId: string;
  categoryId: string;
  transactionFee: string;
  note: string;
  /** Set when the API rejected the row; cleared by the next edit. */
  error?: string;
};

export type CatchUpAccount = { id: string; currency: string };
export type CatchUpCategory = { id: string; categoryGroup: string };

export function categoryGroupForCatchUpKind(kind: CatchUpKind) {
  return kind === "income_earned" ? "income" : "expense";
}

/**
 * A decimal amount as integer minor units, or null if it is not one.
 *
 * Parsed as text rather than through parseFloat so no amount ever passes
 * through a float: "0.29" must be 29, not 28.999…. Thousands separators are
 * accepted because that is how amounts appear on statements and SMS alerts.
 */
export function parseAmountMinor(value: string): number | null {
  const cleaned = value.trim().replace(/[,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

export function newRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A fresh row that continues the run the previous row started.
 *
 * Date, account and kind carry over; amount, fee, category and note never do,
 * since a copied amount saved without being noticed is a wrong record.
 */
export function nextRow(previous: CatchUpRow | undefined, fallback: { date: string; accountId: string }, id = newRowId()): CatchUpRow {
  return {
    id,
    kind: previous?.kind ?? "expense_living",
    transactionDate: previous?.transactionDate ?? fallback.date,
    amount: "",
    accountId: previous?.accountId ?? fallback.accountId,
    categoryId: "",
    transactionFee: "",
    note: "",
  };
}

/** A row nobody has typed into yet; skipped on save rather than rejected. */
export function isBlankRow(row: CatchUpRow) {
  return !row.amount.trim() && !row.transactionFee.trim() && !row.note.trim() && !row.categoryId;
}

/**
 * Applies an edit, keeping the row internally consistent.
 *
 * Switching between expense and income empties a category from the other
 * group, which the API would otherwise accept and file in the wrong report.
 */
export function editRow(row: CatchUpRow, patch: Partial<Omit<CatchUpRow, "id" | "error">>, categories: CatchUpCategory[]): CatchUpRow {
  const next: CatchUpRow = { ...row, ...patch, error: undefined };
  if (next.categoryId) {
    const category = categories.find((item) => item.id === next.categoryId);
    if (!category || category.categoryGroup !== categoryGroupForCatchUpKind(next.kind)) {
      next.categoryId = "";
    }
  }
  return next;
}

/** Why a row cannot be saved yet, or null when it can. */
export function rowProblem(row: CatchUpRow, accounts: CatchUpAccount[], today: string): string | null {
  const amount = parseAmountMinor(row.amount);
  if (amount === null || amount <= 0) return "Enter an amount above zero.";
  if (row.transactionFee.trim() && parseAmountMinor(row.transactionFee) === null) return "The fee is not a valid amount.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.transactionDate)) return "Pick a date.";
  if (row.transactionDate > today) return "The date is in the future.";
  if (!accounts.some((account) => account.id === row.accountId)) return "Pick an account.";
  return null;
}

/**
 * The POST /v1/transactions body for a valid row.
 *
 * Currency is taken from the account, never chosen: an entry whose currency
 * differs from its account's counts toward no balance at all.
 */
export function rowPayload(row: CatchUpRow, accounts: CatchUpAccount[]) {
  const account = accounts.find((item) => item.id === row.accountId);
  if (!account) throw new Error(`Account ${row.accountId} is not available`);
  const fee = parseAmountMinor(row.transactionFee) ?? 0;
  const note = row.note.trim();
  return {
    transactionDate: row.transactionDate,
    entryKind: row.kind,
    amount: parseAmountMinor(row.amount) ?? 0,
    currency: account.currency,
    accountId: account.id,
    categoryId: row.categoryId || undefined,
    transactionFee: fee > 0 ? fee : undefined,
    note: note || undefined,
    source: "manual",
  };
}

/**
 * Totals of the rows that would be saved, per currency and direction.
 *
 * Kept per currency because a sum across currencies is not a number anyone
 * can use.
 */
export function sheetTotals(rows: CatchUpRow[], accounts: CatchUpAccount[]) {
  const totals = new Map<string, { spent: number; received: number; fees: number }>();
  for (const row of rows) {
    const account = accounts.find((item) => item.id === row.accountId);
    const amount = parseAmountMinor(row.amount);
    if (!account || amount === null) continue;
    const total = totals.get(account.currency) ?? { spent: 0, received: 0, fees: 0 };
    if (row.kind === "income_earned") total.received += amount;
    else total.spent += amount;
    total.fees += parseAmountMinor(row.transactionFee) ?? 0;
    totals.set(account.currency, total);
  }
  return [...totals.entries()].map(([currency, total]) => ({ currency, ...total }));
}

const DRAFT_KEY = "expenses.catchUpDraft";

function isRow(value: unknown): value is CatchUpRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && (row.kind === "expense_living" || row.kind === "income_earned")
    && ["transactionDate", "amount", "accountId", "categoryId", "transactionFee", "note"].every((key) => typeof row[key] === "string");
}

/**
 * Unsaved rows from an earlier visit.
 *
 * A backlog is rarely cleared in one sitting, so closing the tab must not
 * throw away half an evening's typing. Local to this device on purpose: a
 * draft is not a record.
 */
export function loadDraft(): CatchUpRow[] {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRow).map((row) => ({ ...row, error: undefined })) : [];
  } catch {
    return [];
  }
}

export function saveDraft(rows: CatchUpRow[]) {
  try {
    const worth = rows.filter((row) => !isBlankRow(row));
    if (worth.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(worth));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // The draft is a convenience; the sheet still works without it.
  }
}
