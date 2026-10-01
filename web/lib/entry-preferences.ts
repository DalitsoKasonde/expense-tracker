/**
 * What the add-entry form remembers between entries.
 *
 * Recording a spend is the most repeated action in the app, and most of it is
 * the same every time: the same account, often a similar fee. This remembers
 * those locally so they can be offered back.
 *
 * Deliberately not stored on the server: it is a convenience for this device,
 * and a wrong guess must never become part of the record. Every read and write
 * is guarded — private browsing and full quotas both throw — and a failure just
 * means nothing is remembered.
 */

const ACCOUNT_KEY = "expenses.lastAccountByEntryKind";
const FEE_KEY = "expenses.recentFeesByAccount";
const CATEGORY_KEY = "expenses.recentCategoriesByEntryKind";

/** How many distinct recent fees to offer for one account. */
const MAX_FEE_SUGGESTIONS = 3;

/** How many recent categories to offer for one kind of entry. */
const MAX_CATEGORY_SUGGESTIONS = 5;

function readMap(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Anything else in this key is not ours; treat it as absent rather than
    // letting a bad shape throw during render.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, unknown>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing is remembered this time; the entry itself is unaffected.
  }
}

/** Remembers the account an entry of this kind was recorded against. */
export function rememberAccountForEntryKind(entryKind: string, accountId: string) {
  if (!entryKind || !accountId) return;
  writeMap(ACCOUNT_KEY, { ...readMap(ACCOUNT_KEY), [entryKind]: accountId });
}

/**
 * The account last used for this kind of entry.
 *
 * Callers must confirm the account is still selectable before applying it: it
 * may since have been archived, or be in the wrong currency for this entry.
 */
export function recallAccountForEntryKind(entryKind: string): string | undefined {
  const value = readMap(ACCOUNT_KEY)[entryKind];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Remembers a fee charged on an account, most recent first.
 *
 * Zero is not remembered: "no fee" is the empty state, not a suggestion worth
 * offering back.
 */
export function rememberFeeForAccount(accountId: string, feeMinor: number) {
  if (!accountId || !Number.isFinite(feeMinor) || feeMinor <= 0) return;

  const all = readMap(FEE_KEY);
  const existing = recallFeesForAccount(accountId);
  const next = [feeMinor, ...existing.filter((fee) => fee !== feeMinor)].slice(0, MAX_FEE_SUGGESTIONS);
  writeMap(FEE_KEY, { ...all, [accountId]: next });
}

/** Recent distinct fees charged on this account, most recent first. */
export function recallFeesForAccount(accountId: string): number[] {
  if (!accountId) return [];
  const value = readMap(FEE_KEY)[accountId];
  if (!Array.isArray(value)) return [];
  return value
    .filter((fee): fee is number => typeof fee === "number" && Number.isFinite(fee) && fee > 0)
    .slice(0, MAX_FEE_SUGGESTIONS);
}

/**
 * Remembers a category used for this kind of entry, most recent first.
 *
 * Offered back as one-tap choices rather than preselected, for the same reason
 * as fees: a category carried over unnoticed files the entry in the wrong
 * report, and nothing downstream would catch it.
 */
export function rememberCategoryForEntryKind(entryKind: string, categoryId: string) {
  if (!entryKind || !categoryId) return;
  const all = readMap(CATEGORY_KEY);
  const existing = recallCategoriesForEntryKind(entryKind);
  const next = [categoryId, ...existing.filter((id) => id !== categoryId)].slice(0, MAX_CATEGORY_SUGGESTIONS);
  writeMap(CATEGORY_KEY, { ...all, [entryKind]: next });
}

/**
 * Recently used categories for this kind of entry, most recent first.
 *
 * Callers must drop ids that no longer name a selectable category: one may
 * since have been deleted.
 */
export function recallCategoriesForEntryKind(entryKind: string): string[] {
  if (!entryKind) return [];
  const value = readMap(CATEGORY_KEY)[entryKind];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_CATEGORY_SUGGESTIONS);
}
