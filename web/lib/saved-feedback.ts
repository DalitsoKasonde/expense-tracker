/**
 * The line shown after an entry is saved.
 *
 * Recording spending pays off weeks later, if ever, and that gap is much of why
 * it gets skipped. Showing where the category stands the moment an entry lands
 * makes the payoff immediate: the entry just saved is already part of a number
 * worth knowing.
 */

import { formatMoney } from "./format-money";

export type CategorySpendingNode = {
  id: string;
  /** Per calendar month, January first; includes subcategories. */
  months: number[];
  children: CategorySpendingNode[];
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A category's spending in one month (1–12), or null if it has none on record. */
export function categoryMonthTotal(nodes: CategorySpendingNode[], categoryId: string, month: number): number | null {
  for (const node of nodes) {
    if (node.id === categoryId) return node.months?.[month - 1] ?? null;
    const found = categoryMonthTotal(node.children ?? [], categoryId, month);
    if (found !== null) return found;
  }
  return null;
}

export type SavedSummary = {
  amountMinor: number;
  currency: string;
  transactionDate: string;
  categoryName?: string;
};

/**
 * "Saved K 85.00 — K 340.00 on Food in September", or just the first half
 * when there is no category or no total to show.
 *
 * The month is the entry's own, not today's: a backfilled entry from last
 * month adds to last month.
 */
export function savedMessage(entry: SavedSummary, monthTotalMinor: number | null) {
  const saved = `Saved ${formatMoney(entry.amountMinor, entry.currency)}`;
  const month = Number(entry.transactionDate.slice(5, 7));
  if (!entry.categoryName || monthTotalMinor === null || monthTotalMinor <= 0 || !MONTH_NAMES[month - 1]) return saved;
  return `${saved} — ${formatMoney(monthTotalMinor, entry.currency)} on ${entry.categoryName} in ${MONTH_NAMES[month - 1]}`;
}
