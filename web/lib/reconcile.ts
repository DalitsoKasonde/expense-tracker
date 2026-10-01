/**
 * Closing the gap between what the app thinks an account holds and what it
 * actually holds.
 *
 * After a backlog, some spending can never be recovered — cash, a forgotten
 * purchase, a message deleted weeks ago. Without a way to close that gap the
 * backlog is never finished, which is exactly the feeling that stops people
 * tracking. Recording the shortfall as one honest, clearly labelled entry lets
 * the balance be right again from today without pretending to know the detail.
 */

export type Reconciliation =
  | { outcome: "match" }
  /** Less money than tracked: something was spent and not recorded. */
  | { outcome: "shortfall"; amountMinor: number }
  /** More money than tracked: income was missed, or a spend recorded twice. */
  | { outcome: "surplus"; amountMinor: number };

export function reconcile(trackedMinor: number, actualMinor: number): Reconciliation {
  const difference = trackedMinor - actualMinor;
  if (difference === 0) return { outcome: "match" };
  return difference > 0
    ? { outcome: "shortfall", amountMinor: difference }
    : { outcome: "surplus", amountMinor: -difference };
}

export const UNACCOUNTED_NOTE = "Unaccounted spending (balance reconciled)";

/**
 * The entry that records a shortfall.
 *
 * An ordinary living expense, so it counts toward spending — the money was
 * spent, only its detail is missing. The fixed note is what makes these lines
 * findable later. Only a shortfall is ever booked: a surplus has several
 * possible causes, and guessing one would put a wrong fact in the record.
 */
export function unaccountedSpendingPayload(
  account: { id: string; currency: string },
  shortfallMinor: number,
  date: string,
) {
  if (!Number.isSafeInteger(shortfallMinor) || shortfallMinor <= 0) {
    throw new Error("Only a positive shortfall can be recorded");
  }
  return {
    transactionDate: date,
    entryKind: "expense_living",
    amount: shortfallMinor,
    currency: account.currency,
    accountId: account.id,
    note: UNACCOUNTED_NOTE,
    source: "manual",
  };
}
