/**
 * Entry kinds that can be recorded for a past date without a funding account.
 *
 * Backfilled years often record what was spent, saved, or bought without any
 * record of which account the money left. Investment income and reinvested
 * dividends are included because their asset history remains meaningful without
 * retroactively inflating a cash balance. Lending and debt transfers remain
 * absent because dropping their account would lose one side of the movement.
 *
 * Mirrors historicalBackfillEntryKinds in the API; changing one without the
 * other produces a form that submits entries the API rejects.
 */
const historicalBackfillEntryKinds = [
  "saving_transfer",
  "investment_buy",
  "investment_income",
  "dividend_drip",
  "expense_living",
  "expense_interest",
  "expense_fee",
] as const;

export function supportsHistoricalBackfill(entryKind: string) {
  return historicalBackfillEntryKinds.some((kind) => kind === entryKind);
}
