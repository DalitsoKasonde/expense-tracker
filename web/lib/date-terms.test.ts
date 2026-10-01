import { describe, expect, it } from "vitest";
import { addYearsToDate, isPastDate, localDate, localDateDaysAgo } from "./date-terms";

describe("addYearsToDate", () => {
  it("calculates a maturity date from an issue date and term", () => {
    expect(addYearsToDate("2026-01-01", 3)).toBe("2029-01-01");
  });

  it("clamps a leap-day issue date to the last day of February", () => {
    expect(addYearsToDate("2024-02-29", 3)).toBe("2027-02-28");
  });

  it("rejects invalid dates and terms", () => {
    expect(addYearsToDate("", 3)).toBe("");
    expect(addYearsToDate("2026-01-01", 0)).toBe("");
    expect(addYearsToDate("2026-01-01", 1.5)).toBe("");
  });
});

describe("isPastDate", () => {
  it("only accepts dates before today", () => {
    expect(isPastDate("2026-07-28", "2026-07-29")).toBe(true);
    expect(isPastDate("2026-07-29", "2026-07-29")).toBe(false);
    expect(isPastDate("2026-07-30", "2026-07-29")).toBe(false);
  });

  it("rejects incomplete date values", () => {
    expect(isPastDate("", "2026-07-29")).toBe(false);
    expect(isPastDate("28/07/2026", "2026-07-29")).toBe(false);
  });
});

describe("the local date", () => {
  it("stays on the local day just after midnight", () => {
    // 00:30 in Lusaka is 22:30 UTC the day before; toISOString would say the 9th.
    const justAfterMidnight = new Date(2026, 8, 10, 0, 30);
    expect(localDate(justAfterMidnight)).toBe("2026-09-10");
  });
});

describe("days ago", () => {
  it("steps back across a month boundary on the local calendar", () => {
    expect(localDateDaysAgo(1, new Date(2026, 9, 1, 0, 30))).toBe("2026-09-30");
    expect(localDateDaysAgo(2, new Date(2026, 2, 1, 12))).toBe("2026-02-27");
  });
});
