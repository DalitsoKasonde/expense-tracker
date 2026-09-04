import { describe, expect, it } from "vitest";
import {
  formatPurchaseDate,
  formatShares,
  inferLuSETicker,
  stockReturn,
  rateFromTaxMinor,
  taxMinorFromRate,
  toMinor,
  toRate,
} from "./asset-detail";

describe("money parsing", () => {
  it("converts a decimal input to minor units", () => {
    expect(toMinor("12.34")).toBe(1234);
    expect(toMinor("0.05")).toBe(5);
  });

  it("treats empty and unparseable input as zero rather than NaN", () => {
    expect(toMinor("")).toBe(0);
    expect(toMinor("abc")).toBe(0);
  });

  it("rounds a third decimal to the nearest minor unit", () => {
    expect(toMinor("1.006")).toBe(101);
    expect(toMinor("1.004")).toBe(100);
  });

  it("rounds an exact half-cent down, as binary floating point requires", () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE 754, so Math.round gives 100.
    // Pinned deliberately: the amount inputs step in whole cents, so this only
    // arises from pasted or imported values, and changing it would change what
    // the API is sent. A future switch to exact decimal parsing should have to
    // update this expectation on purpose.
    expect(toMinor("1.005")).toBe(100);
  });
});

describe("withholding rate", () => {
  it("clamps a rate to 0-100", () => {
    expect(toRate("15")).toBe(15);
    expect(toRate("150")).toBe(100);
    expect(toRate("-5")).toBe(0);
    expect(toRate("")).toBe(0);
  });

  it("takes the entered rate off the gross coupon", () => {
    expect(taxMinorFromRate(10_000, "15")).toBe(1_500);
    expect(taxMinorFromRate(10_000, "0")).toBe(0);
  });

  it("never deducts more than the coupon itself", () => {
    // A rate above 100 would otherwise produce a deduction larger than the
    // payment, leaving a negative net coupon.
    expect(taxMinorFromRate(10_000, "500")).toBe(10_000);
  });

  it("recovers a clean rate from an already-recorded deduction", () => {
    expect(rateFromTaxMinor(10_000, 1_500)).toBe("15");
    expect(rateFromTaxMinor(10_000, 0)).toBe("0");
  });

  it("does not divide by a zero gross", () => {
    expect(rateFromTaxMinor(0, 500)).toBe("0");
    expect(rateFromTaxMinor(-1, 500)).toBe("0");
  });

  it("round-trips a rate through the deduction and back", () => {
    const gross = 250_00;
    expect(rateFromTaxMinor(gross, taxMinorFromRate(gross, "12.5"))).toBe("12.5");
  });
});

describe("LuSE ticker inference", () => {
  it("prefers an explicit symbol and drops the .ZM suffix", () => {
    expect(inferLuSETicker("atel.zm", "Airtel Networks Zambia")).toBe("ATEL");
    expect(inferLuSETicker(" znco ", "Anything")).toBe("ZNCO");
  });

  it("falls back to matching the company name", () => {
    // Spreadsheet imports routinely carry a name and no symbol.
    expect(inferLuSETicker(null, "Copperbelt Energy Corporation")).toBe("CECZ");
    expect(inferLuSETicker("", "Zambia Sugar Plc")).toBe("ZSUG");
    expect(inferLuSETicker(undefined, "ZCCM Investments Holdings")).toBe("ZCCM-IH");
  });

  it("returns an empty ticker rather than guessing", () => {
    expect(inferLuSETicker(null, "Some Unlisted Company")).toBe("");
  });
});

describe("purchase date formatting", () => {
  it("reads a date-only value in local time, not UTC", () => {
    // Parsing "2026-03-01" directly would shift a day behind UTC, so the helper
    // pins midnight local.
    expect(formatPurchaseDate("2026-03-01")).toContain("2026");
    expect(formatPurchaseDate("2026-03-01T22:30:00Z")).toBe(formatPurchaseDate("2026-03-01"));
  });
});

describe("formatShares", () => {
  it("drops the padding zeros a whole share count used to carry", () => {
    expect(formatShares(150)).toBe("150");
    expect(formatShares(1500)).toBe("1,500");
  });

  it("keeps the fraction a reinvested dividend produces", () => {
    expect(formatShares(12.3457)).toBe("12.3457");
  });
});

describe("stockReturn", () => {
  const base = { investedMinor: 10_000, currentValueMinor: 11_000, dividendTotalMinor: 2_500, quantity: 10 };

  it("adds dividends to the price move rather than leaving them invisible", () => {
    const result = stockReturn(base);
    expect(result.priceReturnMinor).toBe(1_000);
    expect(result.totalReturnMinor).toBe(3_500);
    expect(result.totalReturnPercent).toBe(35);
    expect(result.costRecoveredPercent).toBe(25);
  });

  it("derives the carried price per share and the break-even price", () => {
    const result = stockReturn(base);
    expect(result.pricePerShareMinor).toBe(1_100);
    // (100.00 - 25.00) across 10 shares.
    expect(result.breakEvenPriceMinor).toBe(750);
  });

  it("floors break-even at zero once dividends have repaid the cost", () => {
    expect(stockReturn({ ...base, dividendTotalMinor: 12_000 }).breakEvenPriceMinor).toBe(0);
  });

  it("gives no percentages or per-share figures for a holding with nothing bought", () => {
    const result = stockReturn({ investedMinor: 0, currentValueMinor: 0, dividendTotalMinor: 0, quantity: 0 });
    expect(result.totalReturnPercent).toBeNull();
    expect(result.costRecoveredPercent).toBeNull();
    expect(result.pricePerShareMinor).toBeNull();
    expect(result.breakEvenPriceMinor).toBeNull();
  });
});
