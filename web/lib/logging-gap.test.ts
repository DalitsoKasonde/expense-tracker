import { describe, expect, it } from "vitest";
import { daysBehind, describeGap, gapIsWorthMentioning } from "./logging-gap";

describe("how far behind the record is", () => {
  it("counts whole days from the newest entry to today", () => {
    expect(daysBehind("2026-09-10", "2026-09-30")).toBe(20);
    expect(daysBehind("2026-09-30", "2026-10-01")).toBe(1);
  });

  it("is not thrown by a daylight-saving change between the two dates", () => {
    expect(daysBehind("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("has nothing to say before the first entry", () => {
    expect(daysBehind(null, "2026-09-30")).toBeNull();
  });

  it("only mentions a gap from two days, since today and yesterday are often entered late", () => {
    expect(gapIsWorthMentioning(daysBehind("2026-09-29", "2026-09-30"))).toBe(false);
    expect(gapIsWorthMentioning(daysBehind("2026-09-28", "2026-09-30"))).toBe(true);
  });

  it("names the day the record stops at", () => {
    expect(describeGap("2026-09-10", 20)).toMatch(/— 20 days ago\.$/);
  });
});
