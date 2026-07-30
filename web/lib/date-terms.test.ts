import { describe, expect, it } from "vitest";
import { addYearsToDate, isPastDate } from "./date-terms";

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
