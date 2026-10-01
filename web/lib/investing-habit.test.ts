import { describe, expect, it } from "vitest";
import { describeDuration, habitFor, investingHabit, totalReturn, weightedHoldingDays } from "./investing-habit";

describe("total return", () => {
  it("counts dividends with the price change, as the dashboard's own figures do", () => {
    // The screenshot's numbers: value 2,394.24, invested 2,496.40, dividends 8.03.
    const result = totalReturn(239424, 249640, 803);
    expect(result).toMatchObject({ priceMinor: -10216, incomeMinor: 803, amountMinor: -9413 });
    expect(result.percent).toBeCloseTo(-3.77, 2);
  });

  it("has no percentage before anything is invested", () => {
    expect(totalReturn(0, 0, 0).percent).toBeNull();
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

describe("finding a scope's habit", () => {
  const record = {
    currency: "ZMW",
    months: [{ month: "2026-10", investedMinor: 100 }],
    monthsInARow: 1,
    averageHoldingDays: null,
    firstPurchaseDate: "2026-10-01",
    totalContributedMinor: 100,
  };

  it("applies that scope's own target, not another's", () => {
    const activity = { asOf: "2026-10-02", scopes: { bond: [record] }, holdings: [], targets: { stock: 500, bond: 900 } };
    expect(habitFor(activity, "bond", "ZMW", "ZMW")?.target?.targetMinor).toBe(900);
  });

  it("has no habit for a scope or currency with no record, or from an older API", () => {
    const activity = { asOf: "2026-10-02", scopes: { bond: [record] }, holdings: [], targets: {} };
    expect(habitFor(activity, "stock", "ZMW", "ZMW")).toBeNull();
    expect(habitFor(activity, "bond", "USD", "ZMW")).toBeNull();
    expect(habitFor({ asOf: "2026-10-02" } as never, "bond", "ZMW", "ZMW")).toBeNull();
    expect(habitFor(null, "bond", "ZMW", "ZMW")).toBeNull();
  });
});

describe("weighted holding period", () => {
  it("weights each holding by its amount", () => {
    // 100 days on 9,000 and 10 days on 1,000.
    expect(weightedHoldingDays([{ since: "2026-06-23", weightMinor: 9000 }, { since: "2026-09-21", weightMinor: 1000 }], "2026-10-01")).toBe(91);
  });

  it("has no period when nothing is held", () => {
    expect(weightedHoldingDays([], "2026-10-01")).toBeNull();
    expect(weightedHoldingDays([{ since: "", weightMinor: 100 }], "2026-10-01")).toBeNull();
  });
});
