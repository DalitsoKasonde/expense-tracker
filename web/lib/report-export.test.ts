import { annualReportFilename, buildAnnualReportCsv, type ExportReportMonth } from "./report-export";
import { describe, expect, it } from "vitest";

const month: ExportReportMonth = {
  monthLabel: "Jan, revised",
  earnedIncome: 250_000,
  borrowedIncome: 50_000,
  totalInflow: 300_000,
  livingExpenses: 100_000,
  debtPrincipalPaid: 25_000,
  debtInterestFees: 5_000,
  savings: 40_000,
  investments: 30_000,
  operatingBalance: 150_000,
  freeCashFlow: 120_000,
  amountBroughtForward: -10_000,
  endingCashBalance: 110_000,
  netWorth: 500_000,
  savingsRateBps: 2800,
  debtBurdenRateBps: 1200,
  interestLeakageBps: 200,
  borrowedDependencyBps: 1667,
  wealthBuildRateBps: 3800,
};

describe("annual report CSV export", () => {
  it("exports metadata, monthly amounts, YTD values, and every ratio", () => {
    const csv = buildAnnualReportCsv(
      { year: 2026, data: [month], ytd: month },
      "ZMW",
      new Date("2026-07-29T08:00:00Z"),
    );

    expect(csv).toContain("Year,2026");
    expect(csv).toContain("Currency,ZMW");
    expect(csv).toContain('Metric,"Jan, revised",YTD');
    expect(csv).toContain("Cash commitments,1300.00,1300.00");
    expect(csv).toContain("Amount brought forward,-100.00,-100.00");
    expect(csv).toContain("Borrowed dependency,16.67%,16.67%");
    expect(csv).toContain("Generated,2026-07-29");
  });

  it("creates a safe, descriptive filename", () => {
    expect(annualReportFilename(2026, "zmw")).toBe("expenses-report-2026-ZMW.csv");
    expect(annualReportFilename(2025, "US D$")).toBe("expenses-report-2025-USD.csv");
  });
});
