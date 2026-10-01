import { describe, expect, it } from "vitest";
import { stockHighlights, type InsightStock } from "./stock-insights";

function stock(patch: Partial<InsightStock> & Pick<InsightStock, "assetId">): InsightStock {
  return { name: patch.assetId.toUpperCase(), currency: "ZMW", quantity: 100, investedMinor: 10000, valueMinor: 10000, ...patch };
}

describe("highlights", () => {
  const today = "2026-10-01";
  const stocks = [
    stock({ assetId: "scbl", quantity: 50, investedMinor: 50000, valueMinor: 60000 }),
    stock({ assetId: "zccm", quantity: 1000, investedMinor: 30000, valueMinor: 24000 }),
    stock({ assetId: "zanaco", quantity: 400, investedMinor: 20000, valueMinor: 19000 }),
  ];
  const activity = new Map(
    [
      { id: "scbl", lastContributionDate: "2026-09-20", incomeMinor: 0 },
      { id: "zccm", lastContributionDate: "2026-03-01", incomeMinor: 900 },
      { id: "zanaco", lastContributionDate: "2026-08-01", incomeMinor: 1500 },
    ].map((item) => [item.id, { kind: "stock", ...item }]),
  );

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
