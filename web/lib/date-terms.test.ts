import { describe, expect, it } from "vitest";
import { addYearsToDate } from "./date-terms";

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
