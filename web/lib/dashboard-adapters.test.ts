import { adaptSavingsGoals } from "./dashboard-adapters";
import { describe, expect, it } from "vitest";

describe("adaptSavingsGoals", () => {
  it("maps valid targets and derives currency from their account", () => {
    const goals = adaptSavingsGoals([{ id: "g1", accountId: "a1", name: "Trip", targetMinor: 10000, currentBalance: 2500 }], [{ accountId: "a1", name: "Trip", accountType: "savings", accountClass: "asset", currency: "USD", balanceMinor: 2500 }]);
    expect(goals).toEqual([expect.objectContaining({ name: "Trip", currency: "USD", currentMinor: 2500 })]);
  });

  it("drops groups without a usable target", () => {
    expect(adaptSavingsGoals([{ id: "g1", name: "Untargeted", targetMinor: null }])).toEqual([]);
  });
});
