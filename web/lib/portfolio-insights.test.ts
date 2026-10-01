import { describe, expect, it } from "vitest";
import type { Route } from "next";
import type { PortfolioHolding } from "./portfolio-holdings";
import { bondHighlights, indexActivity, pocketHighlights, portfolioHighlights, portfolioReturn, type InsightPocket } from "./portfolio-insights";

function holding(patch: Partial<PortfolioHolding> & Pick<PortfolioHolding, "id" | "kind">): PortfolioHolding {
  return {
    name: patch.id,
    href: `/investments/${patch.id}` as Route,
    meta: "",
    currency: "ZMW",
    currentValueMinor: 10_000,
    investedAmountMinor: 10_000,
    hasPosition: true,
    ...patch,
  };
}

const holdings = [
  holding({ id: "scbl", kind: "stock", currentValueMinor: 12_000, investedAmountMinor: 10_000 }),
  holding({ id: "grz", kind: "bond", currentValueMinor: 50_000, investedAmountMinor: 50_000 }),
  holding({ id: "patumba", kind: "savings_pocket", currentValueMinor: 10_500, investedAmountMinor: 10_000 }),
  holding({ id: "chilimba", kind: "savings_group", currentValueMinor: 8_000, investedAmountMinor: 6_000 }),
];
const activity = indexActivity([
  { kind: "stock", id: "scbl", lastContributionDate: null, incomeMinor: 300 },
  { kind: "bond", id: "grz", lastContributionDate: null, incomeMinor: 4_000 },
  { kind: "savings_pocket", id: "patumba", lastContributionDate: null, incomeMinor: 500 },
  { kind: "savings_group", id: "chilimba", lastContributionDate: null, incomeMinor: 0 },
]);

describe("portfolio return", () => {
  const result = portfolioReturn(holdings, activity);

  it("counts each kind by what it earns, never a bond's or a group's value less cost", () => {
    // Stock: +2,000 price, +300 dividends. Bond: 4,000 coupons. Pocket: 500
    // interest. The group's 2,000 balance over contributions is not counted
    // until it is shared out.
    expect(result.priceMinor).toBe(2_000);
    expect(result.incomeMinor).toBe(4_800);
    expect(result.returnMinor).toBe(6_800);
    expect(result.percent).toBeCloseTo((6_800 / 76_000) * 100, 5);
  });

  it("does not count a pocket's interest twice, once in its balance and again as income", () => {
    const pocket = result.categories.find((category) => category.kind === "savings_pocket");
    expect(pocket?.returnMinor).toBe(500);
  });

  it("leaves out holdings with nothing bought", () => {
    const withPending = portfolioReturn([...holdings, holding({ id: "new", kind: "stock", hasPosition: false, currentValueMinor: 0, investedAmountMinor: 0 })], activity);
    expect(withPending.categories.find((category) => category.kind === "stock")?.holdingCount).toBe(1);
  });
});

describe("portfolio highlights", () => {
  const result = portfolioReturn(holdings, activity);

  it("gives each kind's share of the portfolio", () => {
    const allocation = portfolioHighlights(holdings, result).allocation;
    expect(allocation[0]).toMatchObject({ category: { kind: "bond" } });
    expect(allocation.reduce((sum, item) => sum + item.sharePercent, 0)).toBeCloseTo(100, 5);
  });

  it("ranks kinds by return but leaves savings groups out, whose return waits for share-out", () => {
    // Stocks 23%, bonds 8%, pockets 5%.
    const best = portfolioHighlights(holdings, result).bestCategory;
    expect(best?.kind).toBe("stock");
    const groupsOnlyAhead = portfolioReturn(
      [holding({ id: "chilimba", kind: "savings_group" }), holding({ id: "grz", kind: "bond" })],
      indexActivity([{ kind: "savings_group", id: "chilimba", lastContributionDate: null, incomeMinor: 9_000 }]),
    );
    expect(portfolioHighlights([], groupsOnlyAhead).bestCategory).toBeUndefined();
  });

  it("makes no comparisons with one kind of holding", () => {
    const single = [holdings[0]];
    const highlights = portfolioHighlights(single, portfolioReturn(single, activity));
    expect(highlights.allocation).toEqual([]);
    expect(highlights.bestCategory).toBeUndefined();
    expect(highlights.biggest).toBeUndefined();
  });

  it("mentions the next coupon only when one is due", () => {
    expect(portfolioHighlights(holdings, result, { date: "2026-11-15", amountMinor: 1_200 }).nextCoupon).toEqual({ date: "2026-11-15", amountMinor: 1_200 });
    expect(portfolioHighlights(holdings, result, { amountMinor: 0 }).nextCoupon).toBeUndefined();
  });
});

describe("bond highlights", () => {
  const bonds = [
    { assetId: "a", name: "GRZ 2-year", currency: "ZMW", principalMinor: 100_000, couponRateBps: 1_500, maturityDate: "2027-03-01" },
    { assetId: "b", name: "GRZ 10-year", currency: "ZMW", principalMinor: 300_000, couponRateBps: 2_200, maturityDate: "2036-03-01" },
    { assetId: "c", name: "GRZ matured", currency: "ZMW", principalMinor: 50_000, couponRateBps: 1_200, maturityDate: "2025-01-01" },
  ];
  const coupons = indexActivity([
    { kind: "bond", id: "a", lastContributionDate: null, incomeMinor: 15_000 },
    { kind: "bond", id: "b", lastContributionDate: null, incomeMinor: 20_000 },
  ]);

  it("names the next bond to mature, skipping any already past", () => {
    expect(bondHighlights(bonds, coupons, "2026-10-01").nextMaturity).toMatchObject({ bond: { assetId: "a" }, days: 151 });
  });

  it("ranks coupons paid against each bond's principal, not the largest sum", () => {
    // 15,000 on 100,000 is 15%; 20,000 on 300,000 is under 7%.
    expect(bondHighlights(bonds, coupons, "2026-10-01").topEarner).toMatchObject({ bond: { assetId: "a" }, percentOfPrincipal: 15 });
  });

  it("names the highest rate only when the rates differ", () => {
    expect(bondHighlights(bonds, coupons, "2026-10-01").highestRate?.assetId).toBe("b");
    const same = bonds.map((bond) => ({ ...bond, couponRateBps: 1_800 }));
    expect(bondHighlights(same, coupons, "2026-10-01").highestRate).toBeUndefined();
  });
});

describe("pocket highlights", () => {
  const pocket = (patch: Partial<InsightPocket> & Pick<InsightPocket, "id">): InsightPocket => ({
    name: patch.id,
    currency: "ZMW",
    annualInterestRateBps: null,
    currentBalanceMinor: 10_000,
    netContributionsMinor: 10_000,
    interestEarnedMinor: 0,
    ...patch,
  });
  const pockets = [
    pocket({ id: "patumba", annualInterestRateBps: 1_250, currentBalanceMinor: 30_000, interestEarnedMinor: 1_200 }),
    pocket({ id: "emergency", annualInterestRateBps: 800, currentBalanceMinor: 10_000, interestEarnedMinor: 100 }),
  ];
  const deposits = indexActivity([
    { kind: "savings_pocket", id: "patumba", lastContributionDate: "2026-09-25", incomeMinor: 1_200 },
    { kind: "savings_pocket", id: "emergency", lastContributionDate: "2026-06-01", incomeMinor: 100 },
  ]);

  it("names the best rate, the top earner and the largest pocket", () => {
    const highlights = pocketHighlights(pockets, deposits, "2026-10-01");
    expect(highlights.bestRate?.id).toBe("patumba");
    expect(highlights.topEarner?.pocket.id).toBe("patumba");
    expect(highlights.biggest).toMatchObject({ pocket: { id: "patumba" }, sharePercent: 75 });
  });

  it("mentions a pocket not added to for two months", () => {
    expect(pocketHighlights(pockets, deposits, "2026-10-01").quietest).toMatchObject({ pocket: { id: "emergency" }, days: 122 });
  });

  it("makes no comparisons with one pocket", () => {
    expect(pocketHighlights([pockets[0]], deposits, "2026-10-01")).toEqual({});
  });
});
