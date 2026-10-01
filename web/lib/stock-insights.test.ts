import { describe, expect, it } from "vitest";
import { describeDuration, investingHabit, stockHighlights, totalReturn, type InsightStock } from "./stock-insights";

function stock(patch: Partial<InsightStock> & Pick<InsightStock, "assetId">): InsightStock {
  return { name: patch.assetId.toUpperCase(), currency: "ZMW", quantity: 100, investedMinor: 10000, valueMinor: 10000, ...patch };
}

describe("total return", () => {
  it("counts dividends with the price change, as the dashboard's own figures do", () => {
    // The screenshot's numbers: value 2,394.24, invested 2,496.40, dividends 8.03.
    const result = totalReturn(239424, 249640, 803);
    expect(result).toMatchObject({ priceMinor: -10216, dividendsMinor: 803, amountMinor: -9413 });
    expect(result.percent).toBeCloseTo(-3.77, 2);
  });

  it("has no percentage before anything is invested", () => {
    expect(totalReturn(0, 0, 0).percent).toBeNull();
  });
});

describe("highlights", () => {
  const today = "2026-10-01";
  const stocks = [
    stock({ assetId: "scbl", quantity: 50, investedMinor: 50000, valueMinor: 60000 }),
    stock({ assetId: "zccm", quantity: 1000, investedMinor: 30000, valueMinor: 24000 }),
    stock({ assetId: "zanaco", quantity: 400, investedMinor: 20000, valueMinor: 19000 }),
  ];
  const activity = [
    { assetId: "scbl", lastPurchaseDate: "2026-09-20", dividendsMinor: 0 },
    { assetId: "zccm", lastPurchaseDate: "2026-03-01", dividendsMinor: 900 },
    { assetId: "zanaco", lastPurchaseDate: "2026-08-01", dividendsMinor: 1500 },
  ];

  it("ranks performance by total return, dividends included", () => {
    const highlights = stockHighlights(stocks, activity, today);
    expect(highlights.best?.assetId).toBe("scbl");
    // ZCCM fell 20%, less 3% back in dividends; ZANACO −5% + 7.5% is a gain.
    expect(highlights.worst?.assetId).toBe("zccm");
    expect(highlights.worst?.returnPercent).toBeCloseTo(-17, 5);
  });

  it("names the holdings with the most and fewest shares", () => {
    const highlights = stockHighlights(stocks, activity, today);
    expect(highlights.mostShares?.assetId).toBe("zccm");
    expect(highlights.fewestShares?.assetId).toBe("scbl");
  });

  it("gives the largest holding's share of the portfolio", () => {
    const biggest = stockHighlights(stocks, activity, today).biggest;
    expect(biggest?.stock.assetId).toBe("scbl");
    expect(biggest?.sharePercent).toBeCloseTo((60000 / 103000) * 100, 5);
  });

  it("picks the best dividend payer by what it returned on its cost, not the largest sum", () => {
    // ZANACO paid 1,500 on 20,000 (7.5%); ZCCM 900 on 30,000 (3%).
    expect(stockHighlights(stocks, activity, today).topDividend?.stock.assetId).toBe("zanaco");
  });

  it("gives the share price a losing holding needs to break even", () => {
    expect(stockHighlights(stocks, activity, today).breakEven).toMatchObject({
      stock: { assetId: "zccm" },
      costPerShareMinor: 30,
      pricePerShareMinor: 24,
    });
  });

  it("mentions a holding not added to for two months or more", () => {
    expect(stockHighlights(stocks, activity, today).quietest).toMatchObject({ stock: { assetId: "zccm" }, days: 214 });
  });

  it("makes no comparisons with a single holding, which would be both best and worst", () => {
    const highlights = stockHighlights([stocks[1]], activity, today);
    expect(highlights.best).toBeUndefined();
    expect(highlights.worst).toBeUndefined();
    expect(highlights.mostShares).toBeUndefined();
    // A dividend is still worth showing on its own.
    expect(highlights.topDividend?.stock.assetId).toBe("zccm");
  });

  it("leaves out holdings that have been sold or have no cost", () => {
    const highlights = stockHighlights([...stocks, stock({ assetId: "sold", quantity: 0, valueMinor: 0 })], activity, today);
    expect(highlights.fewestShares?.assetId).toBe("scbl");
  });
});

describe("the investing habit", () => {
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 10 + index, 1));
    return { month: date.toISOString().slice(0, 7), investedMinor: 0 };
  });
  months[11].investedMinor = 20000; // October 2026
  months[10].investedMinor = 50000; // September

  const activity = {
    currency: "ZMW",
    months,
    monthsInARow: 2,
    averageHoldingDays: 150,
    firstPurchaseDate: "2026-04-10",
    totalContributedMinor: 249640,
  };

  it("averages over every month since the first purchase, gaps included", () => {
    const habit = investingHabit(activity, "2026-10-01", null, "ZMW");
    expect(habit.monthsInvesting).toBe(7);
    expect(habit.averagePerMonthMinor).toBe(Math.round(249640 / 7));
    expect(habit.thisMonthMinor).toBe(20000);
  });

  it("measures this month against the target", () => {
    expect(investingHabit(activity, "2026-10-01", 50000, "ZMW").target).toEqual({ targetMinor: 50000, remainingMinor: 30000, reached: false });
    expect(investingHabit(activity, "2026-10-01", 15000, "ZMW").target?.reached).toBe(true);
  });

  it("applies the target only in its own currency", () => {
    expect(investingHabit({ ...activity, currency: "USD" }, "2026-10-01", 50000, "ZMW").target).toBeUndefined();
  });
});

describe("durations", () => {
  it("uses the unit a person would say", () => {
    expect(describeDuration(150)).toBe("5 months");
    expect(describeDuration(21)).toBe("3 weeks");
    expect(describeDuration(1)).toBe("1 day");
  });
});
