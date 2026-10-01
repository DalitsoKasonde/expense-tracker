/**
 * The figures behind the stock dashboard's highlights.
 *
 * Every function takes one currency's stocks. Figures are never summed across
 * currencies.
 */
import { percentOf, QUIET_HOLDING_DAYS, totalReturn, wholeDaysBetween, type HoldingActivity } from "./investing-habit";

export type InsightStock = {
  assetId: string;
  name: string;
  symbol?: string | null;
  currency: string;
  quantity: number;
  investedMinor: number;
  valueMinor: number;
};

export type StockResult = InsightStock & {
  dividendsMinor: number;
  returnMinor: number;
  returnPercent: number;
  lastPurchaseDate: string | null;
};

export type StockHighlights = {
  best?: StockResult;
  worst?: StockResult;
  mostShares?: StockResult;
  fewestShares?: StockResult;
  /** The largest holding, when it is a large enough share to be worth knowing. */
  biggest?: { stock: StockResult; sharePercent: number };
  topDividend?: { stock: StockResult; yieldPercent: number };
  /** Where the share price must get back to for a losing holding to break even. */
  breakEven?: { stock: StockResult; costPerShareMinor: number; pricePerShareMinor: number };
  quietest?: { stock: StockResult; days: number };
};

/**
 * The notable holdings in one currency.
 *
 * Comparisons need at least two holdings: with one stock, it is both the best
 * and the worst, and saying so is noise.
 */
export function stockHighlights(stocks: InsightStock[], activity: Map<string, HoldingActivity>, today: string): StockHighlights {
  const held: StockResult[] = stocks
    .filter((stock) => stock.quantity > 0 && stock.investedMinor > 0)
    .map((stock) => {
      const extra = activity.get(stock.assetId);
      const result = totalReturn(stock.valueMinor, stock.investedMinor, extra?.incomeMinor ?? 0);
      return {
        ...stock,
        dividendsMinor: result.incomeMinor,
        returnMinor: result.amountMinor,
        returnPercent: result.percent ?? 0,
        lastPurchaseDate: extra?.lastContributionDate ?? null,
      };
    });

  const highlights: StockHighlights = {};
  const payer = [...held].filter((stock) => stock.dividendsMinor > 0).sort((a, b) => b.dividendsMinor / b.investedMinor - a.dividendsMinor / a.investedMinor)[0];
  if (payer) highlights.topDividend = { stock: payer, yieldPercent: (payer.dividendsMinor / payer.investedMinor) * 100 };

  if (held.length < 2) return highlights;

  const byReturn = [...held].sort((a, b) => b.returnPercent - a.returnPercent);
  highlights.best = byReturn[0];
  highlights.worst = byReturn[byReturn.length - 1];

  const byShares = [...held].sort((a, b) => b.quantity - a.quantity);
  highlights.mostShares = byShares[0];
  highlights.fewestShares = byShares[byShares.length - 1];

  const totalValue = held.reduce((sum, stock) => sum + stock.valueMinor, 0);
  const biggest = [...held].sort((a, b) => b.valueMinor - a.valueMinor)[0];
  const sharePercent = percentOf(biggest.valueMinor, totalValue);
  if (sharePercent !== null) highlights.biggest = { stock: biggest, sharePercent };

  const worst = highlights.worst;
  if (worst.valueMinor < worst.investedMinor) {
    highlights.breakEven = {
      stock: worst,
      costPerShareMinor: Math.round(worst.investedMinor / worst.quantity),
      pricePerShareMinor: Math.round(worst.valueMinor / worst.quantity),
    };
  }

  const quietest = held
    .filter((stock) => stock.lastPurchaseDate)
    .map((stock) => ({ stock, days: wholeDaysBetween(stock.lastPurchaseDate as string, today) }))
    .sort((a, b) => b.days - a.days)[0];
  if (quietest && quietest.days >= QUIET_HOLDING_DAYS) highlights.quietest = quietest;

  return highlights;
}
