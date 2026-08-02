import type { Route } from "next";

export type PortfolioHoldingKind =
  | "stock"
  | "bond"
  | "savings_group"
  | "cash_equivalent"
  | "other";

export type PortfolioHolding = {
  id: string;
  name: string;
  href: Route;
  kind: PortfolioHoldingKind;
  /** Short qualifier under the name: a ticker, a group's cycle, an asset class. */
  meta: string;
  currency: string;
  currentValueMinor: number;
  investedAmountMinor: number;
  /** False for a tracked asset with nothing bought yet: shown, but never counted. */
  hasPosition: boolean;
};

export type CurrencyTotal = {
  currency: string;
  currentValueMinor: number;
  investedAmountMinor: number;
};

export type PortfolioGroup = {
  kind: PortfolioHoldingKind;
  label: string;
  description: string;
  holdings: PortfolioHolding[];
  /** Per currency, never summed across them. */
  totals: CurrencyTotal[];
  trackedCount: number;
  pendingCount: number;
};

type AssetInput = {
  assetId: string;
  name: string;
  symbol?: string | null;
  assetClass: string;
  currency: string;
  investedAmountMinor: number;
  currentValueMinor: number;
  hasPosition: boolean;
};

type SavingsGroupInput = {
  id: string;
  name: string;
  currency?: string;
  status?: string;
  isShareoutGroup?: boolean;
  currentBalance: number;
  contributedMinor: number;
};

// Order is deliberate: the kinds people check most often come first, and
// "Other" is last so an unclassified holding never leads the page.
const groupOrder: Array<{
  kind: PortfolioHoldingKind;
  label: string;
  description: string;
}> = [
  { kind: "stock", label: "Stocks", description: "Shares priced by the market" },
  {
    kind: "bond",
    label: "Government bonds",
    description: "Fixed coupons held to maturity",
  },
  {
    kind: "savings_group",
    label: "Savings groups",
    description: "Contributions pooled with others",
  },
  {
    kind: "cash_equivalent",
    label: "Cash equivalents",
    description: "Deposits and near-cash holdings",
  },
  { kind: "other", label: "Other holdings", description: "Everything else you track" },
];

function kindForAssetClass(assetClass: string): PortfolioHoldingKind {
  switch (assetClass) {
    case "stock":
      return "stock";
    case "bond":
      return "bond";
    case "cash_equivalent":
      return "cash_equivalent";
    default:
      return "other";
  }
}

export function buildPortfolioHoldings(input: {
  assets: AssetInput[];
  savingsGroups: SavingsGroupInput[];
  fallbackCurrency: string;
}): PortfolioHolding[] {
  const assetHoldings = input.assets.map<PortfolioHolding>((asset) => ({
    id: asset.assetId,
    name: asset.name,
    href: `/investments/${asset.assetId}` as Route,
    kind: kindForAssetClass(asset.assetClass),
    meta: asset.symbol?.trim() ? asset.symbol.trim() : asset.assetClass.replaceAll("_", " "),
    currency: asset.currency,
    currentValueMinor: asset.currentValueMinor,
    investedAmountMinor: asset.investedAmountMinor,
    hasPosition: asset.hasPosition,
  }));

  const groupHoldings = input.savingsGroups.map<PortfolioHolding>((group) => ({
    id: group.id,
    name: group.name,
    href: "/settings/savings-groups" as Route,
    kind: "savings_group",
    meta: group.isShareoutGroup ? "Share-out group" : "Savings group",
    // Groups created before the API returned a currency fall back to the
    // reporting currency rather than being dropped from the portfolio.
    currency: group.currency?.trim() || input.fallbackCurrency,
    currentValueMinor: group.currentBalance,
    investedAmountMinor: group.contributedMinor,
    hasPosition: true,
  }));

  return [...assetHoldings, ...groupHoldings];
}

export function currencyTotals(holdings: PortfolioHolding[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const holding of holdings) {
    if (!holding.hasPosition) continue;
    const total = totals.get(holding.currency) ?? {
      currency: holding.currency,
      currentValueMinor: 0,
      investedAmountMinor: 0,
    };
    total.currentValueMinor += holding.currentValueMinor;
    total.investedAmountMinor += holding.investedAmountMinor;
    totals.set(holding.currency, total);
  }
  return [...totals.values()].sort(
    (first, second) => second.currentValueMinor - first.currentValueMinor,
  );
}

export function groupPortfolioHoldings(holdings: PortfolioHolding[]): PortfolioGroup[] {
  return groupOrder
    .map(({ kind, label, description }) => {
      const kindHoldings = holdings
        .filter((holding) => holding.kind === kind)
        .sort((first, second) => {
          if (first.hasPosition !== second.hasPosition) return first.hasPosition ? -1 : 1;
          if (first.currentValueMinor !== second.currentValueMinor) {
            return second.currentValueMinor - first.currentValueMinor;
          }
          return first.name.localeCompare(second.name);
        });

      return {
        kind,
        label,
        description,
        holdings: kindHoldings,
        totals: currencyTotals(kindHoldings),
        trackedCount: kindHoldings.filter((holding) => holding.hasPosition).length,
        pendingCount: kindHoldings.filter((holding) => !holding.hasPosition).length,
      };
    })
    .filter((group) => group.holdings.length > 0);
}

/**
 * Gain against cost, as a percentage. Null when there is no cost to compare
 * against, so a holding recorded without a cost shows no misleading percentage.
 */
export function gainPercent(currentValueMinor: number, investedAmountMinor: number) {
  if (investedAmountMinor <= 0) return null;
  return ((currentValueMinor - investedAmountMinor) / investedAmountMinor) * 100;
}
