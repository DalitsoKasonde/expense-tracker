/**
 * Total return and highlights for the portfolio overview and the bond and
 * savings pocket dashboards.
 *
 * "Return" means what each kind of holding actually earns, which is not
 * value less cost for all of them:
 *   - stocks: price change plus dividends
 *   - bonds: coupons received. A bond is carried at principal, so value less
 *     cost is zero for its whole life; scheduled coupons are not yet money.
 *   - savings pockets: interest credited
 *   - savings groups: results realised at share-out. Mid-cycle, a group's
 *     balance less contributions is not a gain anyone can take.
 *
 * Every function takes one currency's holdings. Nothing is summed across
 * currencies.
 */
import type { PortfolioHolding, PortfolioHoldingKind } from "./portfolio-holdings";
import { percentOf, QUIET_HOLDING_DAYS, wholeDaysBetween, type HoldingActivity } from "./investing-habit";

export const kindLabels: Record<PortfolioHoldingKind, string> = {
  stock: "Stocks",
  bond: "Bonds",
  savings_pocket: "Savings pockets",
  savings_group: "Savings groups",
  cash_equivalent: "Cash equivalents",
  other: "Other",
};

/** Kinds whose return is the change in value; for the rest it is income alone. */
const pricedKinds = new Set<PortfolioHoldingKind>(["stock", "cash_equivalent", "other"]);

export type CategoryFigure = {
  kind: PortfolioHoldingKind;
  label: string;
  holdingCount: number;
  valueMinor: number;
  investedMinor: number;
  priceMinor: number;
  incomeMinor: number;
  returnMinor: number;
  returnPercent: number | null;
};

export type PortfolioReturn = {
  valueMinor: number;
  investedMinor: number;
  priceMinor: number;
  incomeMinor: number;
  returnMinor: number;
  percent: number | null;
  categories: CategoryFigure[];
};

/**
 * Savings are keyed by kind and id, since a pocket and an asset could share an
 * id. Every asset shares one key space: the API names an asset's kind by its
 * asset class, which the portfolio folds into "other" for unusual classes.
 */
export function activityKey(kind: string, id: string) {
  return `${kind === "savings_pocket" || kind === "savings_group" ? kind : "asset"}:${id}`;
}

export function indexActivity(holdings: HoldingActivity[] | undefined) {
  return new Map((Array.isArray(holdings) ? holdings : []).map((holding) => [activityKey(holding.kind, holding.id), holding]));
}

/** One currency's portfolio return, by category and in total. */
export function portfolioReturn(holdings: PortfolioHolding[], activity: Map<string, HoldingActivity>): PortfolioReturn {
  const byKind = new Map<PortfolioHoldingKind, CategoryFigure>();
  for (const holding of holdings) {
    if (!holding.hasPosition) continue;
    const figure = byKind.get(holding.kind) ?? {
      kind: holding.kind,
      label: kindLabels[holding.kind],
      holdingCount: 0,
      valueMinor: 0,
      investedMinor: 0,
      priceMinor: 0,
      incomeMinor: 0,
      returnMinor: 0,
      returnPercent: null,
    };
    figure.holdingCount += 1;
    figure.valueMinor += holding.currentValueMinor;
    figure.investedMinor += holding.investedAmountMinor;
    if (pricedKinds.has(holding.kind)) figure.priceMinor += holding.currentValueMinor - holding.investedAmountMinor;
    figure.incomeMinor += activity.get(activityKey(holding.kind, holding.id))?.incomeMinor ?? 0;
    byKind.set(holding.kind, figure);
  }

  const categories = [...byKind.values()]
    .map((figure) => {
      const returnMinor = figure.priceMinor + figure.incomeMinor;
      return { ...figure, returnMinor, returnPercent: percentOf(returnMinor, figure.investedMinor) };
    })
    .sort((a, b) => b.valueMinor - a.valueMinor);

  const total = categories.reduce(
    (sum, figure) => ({
      valueMinor: sum.valueMinor + figure.valueMinor,
      investedMinor: sum.investedMinor + figure.investedMinor,
      priceMinor: sum.priceMinor + figure.priceMinor,
      incomeMinor: sum.incomeMinor + figure.incomeMinor,
    }),
    { valueMinor: 0, investedMinor: 0, priceMinor: 0, incomeMinor: 0 },
  );
  const returnMinor = total.priceMinor + total.incomeMinor;
  return { ...total, returnMinor, percent: percentOf(returnMinor, total.investedMinor), categories };
}

export type PortfolioHighlights = {
  allocation: Array<{ category: CategoryFigure; sharePercent: number }>;
  bestCategory?: CategoryFigure;
  biggest?: { holding: PortfolioHolding; sharePercent: number };
  income: Array<{ category: CategoryFigure }>;
  nextCoupon?: { date: string; amountMinor: number };
};

/**
 * What is worth knowing about one currency's portfolio.
 *
 * Comparisons need two of a thing: with one category, it is the whole
 * allocation and the best performer at once, and saying so is noise.
 */
export function portfolioHighlights(
  holdings: PortfolioHolding[],
  result: PortfolioReturn,
  nextCoupon?: { date?: string; amountMinor: number },
): PortfolioHighlights {
  const highlights: PortfolioHighlights = { allocation: [], income: [] };
  const valued = result.categories.filter((category) => category.valueMinor > 0);

  if (valued.length >= 2) {
    highlights.allocation = valued.map((category) => ({
      category,
      sharePercent: percentOf(category.valueMinor, result.valueMinor) ?? 0,
    }));
    // Savings groups are left out of the ranking: their return only appears
    // at share-out, so mid-cycle they would always look like the weakest.
    const ranked = result.categories.filter((category) => category.kind !== "savings_group" && category.returnPercent !== null);
    if (ranked.length >= 2) {
      highlights.bestCategory = [...ranked].sort((a, b) => (b.returnPercent ?? 0) - (a.returnPercent ?? 0))[0];
    }
  }

  const held = holdings.filter((holding) => holding.hasPosition && holding.currentValueMinor > 0);
  if (held.length >= 2) {
    const biggest = [...held].sort((a, b) => b.currentValueMinor - a.currentValueMinor)[0];
    highlights.biggest = { holding: biggest, sharePercent: percentOf(biggest.currentValueMinor, result.valueMinor) ?? 0 };
  }

  highlights.income = result.categories.filter((category) => category.incomeMinor !== 0).map((category) => ({ category }));
  if (nextCoupon?.date && nextCoupon.amountMinor > 0) highlights.nextCoupon = { date: nextCoupon.date, amountMinor: nextCoupon.amountMinor };
  return highlights;
}

export type InsightBond = {
  assetId: string;
  name: string;
  currency: string;
  principalMinor: number;
  couponRateBps?: number;
  issueDate?: string;
  maturityDate?: string;
};

export type BondHighlights = {
  nextMaturity?: { bond: InsightBond; days: number };
  biggest?: { bond: InsightBond; sharePercent: number };
  highestRate?: InsightBond;
  topEarner?: { bond: InsightBond; incomeMinor: number; percentOfPrincipal: number };
};

/** The bonds in one currency worth knowing about. */
export function bondHighlights(bonds: InsightBond[], activity: Map<string, HoldingActivity>, today: string): BondHighlights {
  const held = bonds.filter((bond) => bond.principalMinor > 0);
  const highlights: BondHighlights = {};

  const maturing = held
    .filter((bond) => bond.maturityDate && bond.maturityDate.slice(0, 10) >= today)
    .map((bond) => ({ bond, days: wholeDaysBetween(today, (bond.maturityDate as string).slice(0, 10)) }))
    .sort((a, b) => a.days - b.days)[0];
  if (maturing) highlights.nextMaturity = maturing;

  const earner = held
    .map((bond) => ({ bond, incomeMinor: activity.get(activityKey("bond", bond.assetId))?.incomeMinor ?? 0 }))
    .filter((item) => item.incomeMinor > 0)
    .map((item) => ({ ...item, percentOfPrincipal: (item.incomeMinor / item.bond.principalMinor) * 100 }))
    .sort((a, b) => b.percentOfPrincipal - a.percentOfPrincipal)[0];

  if (held.length < 2) return highlights;
  if (earner) highlights.topEarner = earner;

  const total = held.reduce((sum, bond) => sum + bond.principalMinor, 0);
  const biggest = [...held].sort((a, b) => b.principalMinor - a.principalMinor)[0];
  highlights.biggest = { bond: biggest, sharePercent: percentOf(biggest.principalMinor, total) ?? 0 };

  const rated = held.filter((bond) => (bond.couponRateBps ?? 0) > 0).sort((a, b) => (b.couponRateBps ?? 0) - (a.couponRateBps ?? 0));
  // Only worth naming when the rates differ; otherwise it picks one at random.
  if (rated.length >= 2 && rated[0].couponRateBps !== rated[rated.length - 1].couponRateBps) highlights.highestRate = rated[0];
  return highlights;
}

export type InsightPocket = {
  id: string;
  name: string;
  currency: string;
  annualInterestRateBps?: number | null;
  currentBalanceMinor: number;
  netContributionsMinor: number;
  interestEarnedMinor: number;
};

export type PocketHighlights = {
  bestRate?: InsightPocket;
  topEarner?: { pocket: InsightPocket; percent: number | null };
  biggest?: { pocket: InsightPocket; sharePercent: number };
  quietest?: { pocket: InsightPocket; days: number; lastDate: string };
};

/** The savings pockets in one currency worth knowing about. */
export function pocketHighlights(pockets: InsightPocket[], activity: Map<string, HoldingActivity>, today: string): PocketHighlights {
  const highlights: PocketHighlights = {};
  if (pockets.length < 2) return highlights;

  const rated = pockets.filter((pocket) => (pocket.annualInterestRateBps ?? 0) > 0).sort((a, b) => (b.annualInterestRateBps ?? 0) - (a.annualInterestRateBps ?? 0));
  if (rated.length >= 2 && rated[0].annualInterestRateBps !== rated[rated.length - 1].annualInterestRateBps) highlights.bestRate = rated[0];

  const earner = [...pockets].filter((pocket) => pocket.interestEarnedMinor > 0).sort((a, b) => b.interestEarnedMinor - a.interestEarnedMinor)[0];
  if (earner) highlights.topEarner = { pocket: earner, percent: percentOf(earner.interestEarnedMinor, earner.netContributionsMinor) };

  const total = pockets.reduce((sum, pocket) => sum + Math.max(0, pocket.currentBalanceMinor), 0);
  const biggest = [...pockets].sort((a, b) => b.currentBalanceMinor - a.currentBalanceMinor)[0];
  if (total > 0) highlights.biggest = { pocket: biggest, sharePercent: percentOf(biggest.currentBalanceMinor, total) ?? 0 };

  const quietest = pockets
    .map((pocket) => ({ pocket, lastDate: activity.get(activityKey("savings_pocket", pocket.id))?.lastContributionDate ?? null }))
    .filter((item): item is { pocket: InsightPocket; lastDate: string } => Boolean(item.lastDate))
    .map((item) => ({ ...item, days: wholeDaysBetween(item.lastDate, today) }))
    .sort((a, b) => b.days - a.days)[0];
  if (quietest && quietest.days >= QUIET_HOLDING_DAYS) highlights.quietest = quietest;
  return highlights;
}
