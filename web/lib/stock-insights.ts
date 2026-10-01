/**
 * The figures behind the stock dashboard's summary, highlights and habit card.
 *
 * The page used to lead with "Portfolio fall" in red: price movement alone,
 * which over a few months is mostly noise, which the investor cannot control,
 * and which left out the dividends they had actually been paid. These helpers
 * put the honest total first and give weight to what the investor does
 * control — how much, how often, how long they hold.
 *
 * Every function takes one currency's stocks. Figures are never summed across
 * currencies.
 */

export type InsightStock = {
  assetId: string;
  name: string;
  symbol?: string | null;
  currency: string;
  quantity: number;
  investedMinor: number;
  valueMinor: number;
};

export type StockActivityStock = {
  assetId: string;
  lastPurchaseDate: string | null;
  dividendsMinor: number;
};

export type StockMonth = { month: string; investedMinor: number };

export type StockCurrencyActivity = {
  currency: string;
  months: StockMonth[];
  monthsInARow: number;
  averageHoldingDays: number | null;
  firstPurchaseDate: string;
  totalContributedMinor: number;
};

export type StockActivity = {
  asOf: string;
  currencies: StockCurrencyActivity[];
  stocks: StockActivityStock[];
};

export function percentOf(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Price change plus dividends, against what was paid.
 *
 * Dividends are return too; leaving them out overstated every loss and
 * understated every gain.
 */
export function totalReturn(valueMinor: number, investedMinor: number, dividendsMinor: number) {
  const priceMinor = valueMinor - investedMinor;
  const amountMinor = priceMinor + dividendsMinor;
  return { priceMinor, dividendsMinor, amountMinor, percent: percentOf(amountMinor, investedMinor) };
}

function wholeDaysBetween(from: string, to: string) {
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

/** "5 months", "3 weeks", "12 days" — the unit a person would say aloud. */
export function describeDuration(days: number) {
  if (days >= 60) return `${Math.round(days / 30.44)} months`;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type StockResult = InsightStock & {
  dividendsMinor: number;
  returnMinor: number;
  returnPercent: number;
  lastPurchaseDate: string | null;
};

/** How long without adding to a holding before it is worth mentioning. */
export const QUIET_HOLDING_DAYS = 60;

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
export function stockHighlights(stocks: InsightStock[], activity: StockActivityStock[], today: string): StockHighlights {
  const byAsset = new Map(activity.map((item) => [item.assetId, item]));
  const held: StockResult[] = stocks
    .filter((stock) => stock.quantity > 0 && stock.investedMinor > 0)
    .map((stock) => {
      const extra = byAsset.get(stock.assetId);
      const result = totalReturn(stock.valueMinor, stock.investedMinor, extra?.dividendsMinor ?? 0);
      return {
        ...stock,
        dividendsMinor: result.dividendsMinor,
        returnMinor: result.amountMinor,
        returnPercent: result.percent ?? 0,
        lastPurchaseDate: extra?.lastPurchaseDate ?? null,
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

export type InvestingHabit = {
  months: StockMonth[];
  thisMonthMinor: number;
  monthsInARow: number;
  /** Months from the first purchase to now, counting both ends. */
  monthsInvesting: number;
  /** Total new money over every month since the first purchase, empty ones included. */
  averagePerMonthMinor: number;
  averageHoldingDays: number | null;
  target?: { targetMinor: number; remainingMinor: number; reached: boolean };
};

/**
 * One currency's investing habit, with the monthly target applied when it is
 * in this currency (a target is set in the person's default currency).
 *
 * The average divides by every month since the first purchase, not only the
 * months with one: averaging over active months alone would flatter a habit
 * that has gaps.
 */
export function investingHabit(activity: StockCurrencyActivity, asOf: string, targetMinor: number | null, targetCurrency: string): InvestingHabit {
  const thisMonth = asOf.slice(0, 7);
  const thisMonthMinor = activity.months.find((month) => month.month === thisMonth)?.investedMinor ?? 0;
  const first = activity.firstPurchaseDate;
  const monthsInvesting = first
    ? (Number(asOf.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(asOf.slice(5, 7)) - Number(first.slice(5, 7))) + 1
    : 0;

  const habit: InvestingHabit = {
    months: activity.months,
    thisMonthMinor,
    monthsInARow: activity.monthsInARow,
    monthsInvesting,
    averagePerMonthMinor: monthsInvesting > 0 ? Math.round(activity.totalContributedMinor / monthsInvesting) : 0,
    averageHoldingDays: activity.averageHoldingDays,
  };
  if (targetMinor && targetMinor > 0 && targetCurrency === activity.currency) {
    habit.target = {
      targetMinor,
      remainingMinor: Math.max(0, targetMinor - thisMonthMinor),
      reached: thisMonthMinor >= targetMinor,
    };
  }
  return habit;
}
