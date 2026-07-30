import {
  analyzeReportMonths,
  buildTrendGeometry,
  cashCommitments,
  hasReportMovement,
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
});
