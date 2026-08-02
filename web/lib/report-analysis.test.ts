import {
  analyzeReportMonths,
  buildAxisTicks,
  buildTrendGeometry,
  cashCommitments,
  hasReportMovement,
  monthsInScope,
  peakSpendingMonth,
  percentageChange,
  wealthAllocation,
} from "./report-analysis";
import { describe, expect, it } from "vitest";

const months = [
  {
    month: 1,
    monthLabel: "Jan",
    totalInflow: 500_000,
    livingExpenses: 200_000,
    debtPrincipalPaid: 50_000,
    debtInterestFees: 10_000,
    savings: 40_000,
    investments: 20_000,
    freeCashFlow: 240_000,
  },
  {
    month: 2,
    monthLabel: "Feb",
    totalInflow: 350_000,
    livingExpenses: 260_000,
    debtPrincipalPaid: 70_000,
    debtInterestFees: 20_000,
    savings: 0,
    investments: 0,
    freeCashFlow: 0,
  },
  {
    month: 3,
    monthLabel: "Mar",
    totalInflow: 0,
    livingExpenses: 0,
    debtPrincipalPaid: 0,
    debtInterestFees: 0,
    savings: 0,
    investments: 0,
    freeCashFlow: 0,
  },
];

describe("report analysis", () => {
  it("separates cash commitments from wealth allocations", () => {
    expect(cashCommitments(months[0])).toBe(260_000);
    expect(wealthAllocation(months[0])).toBe(60_000);
  });

  it("ignores empty months and identifies useful annual highlights", () => {
    const analysis = analyzeReportMonths(months);

    expect(analysis.activeMonthCount).toBe(2);
    expect(analysis.strongestMonth?.monthLabel).toBe("Jan");
    expect(analysis.highestCommitmentMonth?.monthLabel).toBe("Feb");
    expect(analysis.averageFreeCashFlow).toBe(120_000);
    expect(analysis.chartMaximum).toBe(500_000);
  });

  it("detects months with financial movement", () => {
    expect(hasReportMovement(months[0])).toBe(true);
    expect(hasReportMovement(months[2])).toBe(false);
  });

  it("calculates comparable percentage changes", () => {
    expect(percentageChange(150, 100)).toBe(50);
    expect(percentageChange(-50, -100)).toBe(50);
    expect(percentageChange(100, 0)).toBeNull();
  });

  it("plots trend points across the available chart area", () => {
    const geometry = buildTrendGeometry([0, 100, 50], 100, 100, 10);

    expect(geometry.minimum).toBe(0);
    expect(geometry.maximum).toBe(100);
    expect(geometry.points).toEqual([
      { x: 10, y: 90 },
      { x: 50, y: 10 },
      { x: 90, y: 50 },
    ]);
  });

  it("limits the current year to months that have happened", () => {
    const twelveMonths = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      monthLabel: `M${index + 1}`,
    }));
    const now = new Date("2026-04-15T00:00:00Z");

    expect(monthsInScope(twelveMonths, 2026, now).map((month) => month.month)).toEqual([
      1, 2, 3, 4,
    ]);
    // Past years are complete, so every month is in scope.
    expect(monthsInScope(twelveMonths, 2025, now)).toHaveLength(12);
  });

  it("labels axis ticks with their values and includes zero when crossed", () => {
    const ticks = buildAxisTicks({ minimum: -100, maximum: 300 }, 100, 10);

    expect(ticks.map((tick) => tick.value)).toEqual([300, 100, 0, -100]);
    expect(ticks[0]).toEqual({ value: 300, y: 10 });
    expect(ticks.at(-1)).toEqual({ value: -100, y: 90 });
    // Zero sits proportionally between the extremes, not at the midpoint.
    expect(ticks[2].y).toBeCloseTo(70);
  });

  it("omits a zero tick when the domain never crosses it", () => {
    const ticks = buildAxisTicks({ minimum: 100, maximum: 500 }, 100, 10);

    expect(ticks.map((tick) => tick.value)).toEqual([500, 300, 100]);
  });

  it("keeps axis ticks stable when every value is identical", () => {
    const ticks = buildAxisTicks({ minimum: 250, maximum: 250 }, 100, 10);

    expect(ticks).toEqual([{ value: 250, y: 50 }]);
  });

  it("names no best month when nothing finished ahead", () => {
    const flatMonths = months.map((month) => ({ ...month, freeCashFlow: 0 }));
    const losingMonths = months.map((month) => ({ ...month, freeCashFlow: -500 }));

    // "Best month: ZMW 0.00" reads as a broken report, not a highlight.
    expect(analyzeReportMonths(flatMonths).strongestMonth).toBeNull();
    expect(analyzeReportMonths(losingMonths).strongestMonth).toBeNull();
  });

  it("finds the highest spending month", () => {
    expect(peakSpendingMonth([0, 300, 900, 900, 0])).toEqual({ index: 2, amount: 900 });
  });

  it("reports no peak when nothing was spent", () => {
    expect(peakSpendingMonth([0, 0, 0])).toBeNull();
    expect(peakSpendingMonth([])).toBeNull();
  });
});
