import { adaptSavingsGoals, outstandingLiabilityAccounts } from "./dashboard-adapters";
import type { UnifiedDashboardAccountBalance } from "./use-unified-dashboard";
import { describe, expect, it } from "vitest";

describe("adaptSavingsGoals", () => {
  it("maps valid targets and derives currency from their account", () => {
    const goals = adaptSavingsGoals([{ id: "g1", accountId: "a1", name: "Trip", targetMinor: 10000, currentBalance: 2500 }], [{ accountId: "a1", name: "Trip", accountType: "savings", accountClass: "asset", currency: "USD", balanceMinor: 2500 }]);
    expect(goals).toEqual([expect.objectContaining({ name: "Trip", currency: "USD", currentMinor: 2500 })]);
  });

  it("drops groups without a usable target", () => {
    expect(adaptSavingsGoals([{ id: "g1", name: "Untargeted", targetMinor: null }])).toEqual([]);
  });

  it("does not present share-out groups as personal goals", () => {
    expect(adaptSavingsGoals([{ id: "g1", name: "Village group", targetMinor: 10000, isShareoutGroup: true }])).toEqual([]);
  });
});

describe("outstandingLiabilityAccounts", () => {
  it("shows only liability accounts that still have money owing", () => {
    const accounts: UnifiedDashboardAccountBalance[] = [
      { accountId: "paid", name: "Judith liability", accountType: "other", accountClass: "liability", currency: "ZMW", balanceMinor: 0 },
      { accountId: "owing", name: "Musonda liability", accountType: "other", accountClass: "liability", currency: "ZMW", balanceMinor: 300_000 },
      { accountId: "cash", name: "Cash", accountType: "cash", accountClass: "asset", currency: "ZMW", balanceMinor: 300_000 },
    ];

    expect(outstandingLiabilityAccounts(accounts).map((account) => account.accountId)).toEqual(["owing"]);
  });
});
