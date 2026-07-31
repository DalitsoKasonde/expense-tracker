import { describe, expect, it } from "vitest";
import { supportsHistoricalBackfill } from "./historical-entries";

describe("supportsHistoricalBackfill", () => {
  it("allows expenses, savings, and investment purchases", () => {
    expect(supportsHistoricalBackfill("expense_living")).toBe(true);
    expect(supportsHistoricalBackfill("expense_interest")).toBe(true);
    expect(supportsHistoricalBackfill("expense_fee")).toBe(true);
    expect(supportsHistoricalBackfill("saving_transfer")).toBe(true);
    expect(supportsHistoricalBackfill("investment_buy")).toBe(true);
  });

  it("refuses kinds that need the account on the other side of the entry", () => {
    expect(supportsHistoricalBackfill("income_earned")).toBe(false);
    expect(supportsHistoricalBackfill("income_borrowed")).toBe(false);
    expect(supportsHistoricalBackfill("debt_principal_payment")).toBe(false);
    expect(supportsHistoricalBackfill("loan_receivable_advance")).toBe(false);
    expect(supportsHistoricalBackfill("")).toBe(false);
  });
});
