import { describe, expect, it } from "vitest";
import {
  buildPortfolioHoldings,
  currencyTotals,
  gainPercent,
  groupPortfolioHoldings,
} from "./portfolio-holdings";

function asset(overrides: Partial<Parameters<typeof buildPortfolioHoldings>[0]["assets"][0]> = {}) {
  return {
    assetId: "asset-1",
    name: "Zambeef",
    symbol: "ZMBF",
    assetClass: "stock",
    currency: "ZMW",
    investedAmountMinor: 100_000,
    currentValueMinor: 120_000,
    hasPosition: true,
    ...overrides,
  };
}

describe("buildPortfolioHoldings", () => {
  it("puts assets and savings groups into one comparable shape", () => {
    const holdings = buildPortfolioHoldings({
      assets: [asset()],
      savingsGroups: [
        {
          id: "group-1",
          name: "Chilimba",
          currency: "ZMW",
          isShareoutGroup: true,
          currentBalance: 50_000,
          contributedMinor: 45_000,
        },
      ],
      fallbackCurrency: "ZMW",
    });

    expect(holdings.map((holding) => holding.kind)).toEqual(["stock", "savings_group"]);
    expect(holdings[1]).toMatchObject({
      name: "Chilimba",
      href: "/settings/savings-groups",
      meta: "Share-out group",
      currentValueMinor: 50_000,
      investedAmountMinor: 45_000,
      hasPosition: true,
    });
  });

  it("falls back to the reporting currency for groups the API did not label", () => {
    const [holding] = buildPortfolioHoldings({
      assets: [],
      savingsGroups: [
        { id: "group-1", name: "Chilimba", currentBalance: 1, contributedMinor: 1 },
      ],
      fallbackCurrency: "USD",
    });
    expect(holding.currency).toBe("USD");
  });

  it("maps unknown asset classes to the other bucket", () => {
    const [holding] = buildPortfolioHoldings({
      assets: [asset({ assetClass: "land", symbol: null })],
      savingsGroups: [],
      fallbackCurrency: "ZMW",
    });
    expect(holding.kind).toBe("other");
    expect(holding.meta).toBe("land");
  });
});

describe("groupPortfolioHoldings", () => {
  const holdings = buildPortfolioHoldings({
    assets: [
      asset({ assetId: "small", name: "Small stock", currentValueMinor: 10_000 }),
      asset({ assetId: "big", name: "Big stock", currentValueMinor: 90_000 }),
      asset({
        assetId: "pending",
        name: "Untraded stock",
        currentValueMinor: 0,
        investedAmountMinor: 0,
        hasPosition: false,
      }),
      asset({ assetId: "bond", name: "GRZ bond", assetClass: "bond", currentValueMinor: 500_000 }),
    ],
    savingsGroups: [
      { id: "group", name: "Chilimba", currency: "ZMW", currentBalance: 5_000, contributedMinor: 5_000 },
    ],
    fallbackCurrency: "ZMW",
  });

  it("orders kinds consistently and drops kinds with nothing in them", () => {
    expect(groupPortfolioHoldings(holdings).map((group) => group.kind)).toEqual([
      "stock",
      "bond",
      "savings_group",
    ]);
  });

  it("sorts by value and sinks holdings with no position to the bottom", () => {
    const stocks = groupPortfolioHoldings(holdings)[0];
    expect(stocks.holdings.map((holding) => holding.id)).toEqual(["big", "small", "pending"]);
    expect(stocks.trackedCount).toBe(2);
    expect(stocks.pendingCount).toBe(1);
  });

  it("subtotals each group without counting positionless holdings", () => {
    const stocks = groupPortfolioHoldings(holdings)[0];
    expect(stocks.totals).toEqual([
      { currency: "ZMW", currentValueMinor: 100_000, investedAmountMinor: 200_000 },
    ]);
  });
});

describe("currencyTotals", () => {
  it("keeps currencies apart instead of summing them", () => {
    const holdings = buildPortfolioHoldings({
      assets: [
        asset({ assetId: "zmw", currency: "ZMW", currentValueMinor: 100 }),
        asset({ assetId: "usd", currency: "USD", currentValueMinor: 900 }),
      ],
      savingsGroups: [],
      fallbackCurrency: "ZMW",
    });

    expect(currencyTotals(holdings)).toEqual([
      { currency: "USD", currentValueMinor: 900, investedAmountMinor: 100_000 },
      { currency: "ZMW", currentValueMinor: 100, investedAmountMinor: 100_000 },
    ]);
  });
});

describe("gainPercent", () => {
  it("measures gain against cost", () => {
    expect(gainPercent(120, 100)).toBeCloseTo(20);
    expect(gainPercent(80, 100)).toBeCloseTo(-20);
  });

  it("returns null when there is no cost to compare against", () => {
    expect(gainPercent(120, 0)).toBeNull();
  });
});
