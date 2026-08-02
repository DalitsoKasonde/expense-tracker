import { describe, expect, it } from "vitest";
import { buildNextSteps, type NextStepInput } from "./next-steps";

const settled: NextStepInput = {
  interests: [],
  hasLiabilityAccount: true,
  hasStock: true,
  hasBond: true,
  accountCount: 2,
  goalCount: 1,
  incomeMinor: 500_000,
  expenseMinor: 200_000,
};

describe("buildNextSteps", () => {
  it("suggests nothing when the month is already recorded", () => {
    expect(buildNextSteps(settled)).toEqual([]);
  });

  it("nudges for income before expenses when neither is recorded", () => {
    const labels = buildNextSteps({ ...settled, incomeMinor: 0, expenseMinor: 0 }).map(
      (step) => step.label,
    );
    expect(labels).toEqual(["Record this month's income"]);
  });

  it("nudges for spending once income exists but nothing was spent", () => {
    const labels = buildNextSteps({ ...settled, expenseMinor: 0 }).map((step) => step.label);
    expect(labels).toEqual(["Record what you have spent this month"]);
  });

  it("puts onboarding setup tasks ahead of general nudges", () => {
    const steps = buildNextSteps({
      ...settled,
      interests: ["loans"],
      hasLiabilityAccount: false,
      goalCount: 0,
    });
    expect(steps[0].label).toContain("loan");
    expect(steps.at(-1)?.href).toBe("/goals");
  });

  it("caps the list so it reads as guidance, not a backlog", () => {
    const steps = buildNextSteps({
      interests: ["loans", "stocks", "bonds"],
      hasLiabilityAccount: false,
      hasStock: false,
      hasBond: false,
      accountCount: 0,
      goalCount: 0,
      incomeMinor: 0,
      expenseMinor: 0,
    });
    expect(steps).toHaveLength(4);
  });
});
