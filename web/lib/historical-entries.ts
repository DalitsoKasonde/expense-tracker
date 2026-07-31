/**
 * Entry kinds that can be recorded for a past date without a funding account.
 *
 * Backfilled years often record what was spent, saved, or bought without any
 * record of which account the money left. Kinds that need an account to land in
 * (income) or that move money between two accounts (lending, debt repayment)
 * are deliberately absent: dropping the account there would lose the transfer
 * itself, not just its funding side.
 *
 * Mirrors historicalBackfillEntryKinds in the API; changing one without the
 * other produces a form that submits entries the API rejects.
 */
const historicalBackfillEntryKinds = [
  "saving_transfer",
  "investment_buy",
  "expense_living",
  "expense_interest",
  "expense_fee",
] as const;

export function supportsHistoricalBackfill(entryKind: string) {
  return historicalBackfillEntryKinds.some((kind) => kind === entryKind);
}
