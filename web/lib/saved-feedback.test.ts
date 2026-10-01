import { describe, expect, it } from "vitest";
import { formatMoney } from "./format-money";
import { categoryMonthTotal, savedMessage } from "./saved-feedback";

const months = (september: number) => Array.from({ length: 12 }, (_, index) => (index === 8 ? september : 0));

const tree = [
  { id: "living", months: months(50000), children: [{ id: "food", months: months(34000), children: [] }] },
  { id: "transport", months: months(12000), children: [] },
];

describe("a category's month total", () => {
  it("finds a subcategory anywhere in the tree", () => {
    expect(categoryMonthTotal(tree, "food", 9)).toBe(34000);
  });

  it("is null for a category with nothing on record", () => {
    expect(categoryMonthTotal(tree, "gifts", 9)).toBeNull();
  });
});

describe("the saved message", () => {
  const entry = { amountMinor: 8500, currency: "ZMW", transactionDate: "2026-09-24", categoryName: "Food" };

  it("says where the category now stands for the entry's month", () => {
    expect(savedMessage(entry, 34000)).toBe(`Saved ${formatMoney(8500, "ZMW")} — ${formatMoney(34000, "ZMW")} on Food in September`);
  });

  it("uses the entry's month, not today's, for a backfilled entry", () => {
    expect(savedMessage({ ...entry, transactionDate: "2026-08-30" }, 1000)).toMatch(/in August$/);
  });

  it("falls back to the amount alone without a category or a total", () => {
    expect(savedMessage({ ...entry, categoryName: undefined }, 34000)).toBe(`Saved ${formatMoney(8500, "ZMW")}`);
    expect(savedMessage(entry, null)).toBe(`Saved ${formatMoney(8500, "ZMW")}`);
  });
});
