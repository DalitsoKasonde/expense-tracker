/**
 * The investing record shared by every portfolio dashboard, from
 * /v1/investments/activity, and the figures built on it.
 *
 * Dashboards used to lead with value less cost, which over a few months is
 * mostly noise, which the investor cannot control, and which left out what
 * their holdings had paid them. These helpers put the honest total first and
 * give weight to what the investor does control: how much, how often, how
 * long they hold.
 *
 * Every figure is for one currency. Nothing is summed across currencies.
 */

/** The whole portfolio, or one kind of holding. */
export type InvestingScope = "all" | "stock" | "bond" | "savings_pocket" | "savings_group";

export type InvestmentMonth = { month: string; investedMinor: number };

export type InvestmentCurrencyActivity = {
  currency: string;
  months: InvestmentMonth[];
  monthsInARow: number;
  /** Reported for stocks only; null everywhere else. */
  averageHoldingDays: number | null;
  firstPurchaseDate: string;
  totalContributedMinor: number;
};

export type HoldingActivity = {
  kind: string;
  /** The asset id for stocks and bonds; the pocket or group id for savings. */
  id: string;
  lastContributionDate: string | null;
  /** Dividends, posted coupons, pocket interest, or a group's share-out results. */
  incomeMinor: number;
};

export type InvestmentActivity = {
  asOf: string;
  scopes: Partial<Record<InvestingScope, InvestmentCurrencyActivity[]>>;
  holdings: HoldingActivity[];
  /** Monthly targets in the person's default currency; an unset scope is absent. */
  targets: Partial<Record<InvestingScope, number>>;
};

/** What each scope's habit card calls the money it counts, and what it leaves out. */
export const scopeWording: Record<InvestingScope, { title: string; noun: string; description: string }> = {
  all: {
    title: "Your investing habit",
    noun: "your investments",
    description: "New money into your whole portfolio. Income, and money moved from one investment to another, are not counted again.",
  },
  stock: {
    title: "Your investing habit",
    noun: "stocks",
    description: "New money you put into stocks. Reinvested dividends are return, so they are not counted here.",
  },
  bond: {
    title: "Your investing habit",
    noun: "bonds",
    description: "New money you put into government bonds. A coupon rolled into another bond is return, so it is not counted here.",
  },
  savings_pocket: {
    title: "Your saving habit",
    noun: "savings pockets",
    description: "Deposits into your savings pockets. Interest is return, so it is not counted here.",
  },
  savings_group: {
    title: "Your saving habit",
    noun: "savings groups",
    description: "What you paid into your savings groups.",
  },
};

export function percentOf(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Price change plus income, against what was paid.
 *
 * Income is return too; leaving it out overstated every loss and understated
 * every gain.
 */
export function totalReturn(valueMinor: number, investedMinor: number, incomeMinor: number) {
  const priceMinor = valueMinor - investedMinor;
  const amountMinor = priceMinor + incomeMinor;
  return { priceMinor, incomeMinor, amountMinor, percent: percentOf(amountMinor, investedMinor) };
}

export function wholeDaysBetween(from: string, to: string) {
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

/**
 * How long money has been held, weighted by amount, so a large early purchase
 * counts for more than a small recent top-up. Null when nothing is held.
 */
export function weightedHoldingDays(items: Array<{ since: string; weightMinor: number }>, today: string) {
  let weighted = 0;
  let total = 0;
  for (const item of items) {
    if (item.weightMinor <= 0 || !/^\d{4}-\d{2}-\d{2}/.test(item.since)) continue;
    weighted += Math.max(0, wholeDaysBetween(item.since, today)) * item.weightMinor;
    total += item.weightMinor;
  }
  return total > 0 ? Math.round(weighted / total) : null;
}

/** How long without adding to a holding before it is worth mentioning. */
export const QUIET_HOLDING_DAYS = 60;

export type InvestingHabit = {
  months: InvestmentMonth[];
  thisMonthMinor: number;
  monthsInARow: number;
  /** Months from the first contribution to now, counting both ends. */
  monthsInvesting: number;
  /** Total new money over every month since the first contribution, empty ones included. */
  averagePerMonthMinor: number;
  averageHoldingDays: number | null;
  target?: { targetMinor: number; remainingMinor: number; reached: boolean };
};

/**
 * One currency's investing habit, with the monthly target applied when it is
 * in this currency (a target is set in the person's default currency).
 *
 * The average divides by every month since the first contribution, not only
 * the months with one: averaging over active months alone would flatter a
 * habit that has gaps.
 */
export function investingHabit(
  activity: InvestmentCurrencyActivity,
  asOf: string,
  targetMinor: number | null | undefined,
  targetCurrency: string,
): InvestingHabit {
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

/**
 * The habit for one scope and currency, or null when there is no record.
 *
 * Guarded throughout: an older API, or a cached response from one, may lack
 * any of these fields.
 */
export function habitFor(
  activity: InvestmentActivity | null,
  scope: InvestingScope,
  currency: string,
  targetCurrency: string,
): InvestingHabit | null {
  const currencyActivity = activity?.scopes?.[scope]?.find((item) => item.currency === currency);
  if (!activity || !currencyActivity) return null;
  return investingHabit(currencyActivity, activity.asOf, activity.targets?.[scope], targetCurrency);
}

/** Each holding's record of one kind, by id. */
export function holdingsOfKind(activity: InvestmentActivity | null, kind: string) {
  const holdings = Array.isArray(activity?.holdings) ? activity.holdings : [];
  return new Map(holdings.filter((holding) => holding.kind === kind).map((holding) => [holding.id, holding]));
}
