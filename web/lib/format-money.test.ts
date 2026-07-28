import { formatMoney, isPositiveEntry } from "./format-money";
import { describe, expect, it } from "vitest";

describe("financial formatting", () => {
  it("formats minor units in the requested currency", () => {
    expect(formatMoney(12345, "USD")).toMatch(/123\.45/);
  });

  it("classifies inflows", () => {
    expect(isPositiveEntry("income_earned")).toBe(true);
    expect(isPositiveEntry("loan_receivable_repayment")).toBe(true);
    expect(isPositiveEntry("loan_receivable_advance")).toBe(false);
    expect(isPositiveEntry("expense_living")).toBe(false);
  });
});
