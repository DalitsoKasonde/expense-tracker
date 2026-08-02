import { describe, expect, it } from "vitest";
import { isSpendableAccount, spendableAccounts } from "./spendable-accounts";

describe("isSpendableAccount", () => {
  it("accepts ordinary asset accounts", () => {
    expect(isSpendableAccount({ accountClass: "asset", accountType: "bank" })).toBe(true);
    expect(isSpendableAccount({ accountClass: "asset", accountType: "mobile_money" })).toBe(true);
  });

  it("rejects liabilities, receivables, and savings-group ledger accounts", () => {
    expect(isSpendableAccount({ accountClass: "liability", accountType: "loan" })).toBe(false);
    // Money owed to you cannot fund a repayment, however asset-classed it is.
    expect(isSpendableAccount({ accountClass: "asset", accountType: "receivable" })).toBe(false);
    expect(isSpendableAccount({
      accountClass: "asset",
      accountType: "savings",
      isSavingsGroupAccount: true,
    })).toBe(false);
  });
});

describe("spendableAccounts", () => {
  it("keeps only the accounts money can leave", () => {
    const accounts = [
      { id: "bank", accountClass: "asset", accountType: "bank" },
      { id: "owed", accountClass: "asset", accountType: "receivable" },
      { id: "card", accountClass: "liability", accountType: "credit_card" },
      { id: "group", accountClass: "asset", accountType: "savings", isSavingsGroupAccount: true },
    ];
    expect(spendableAccounts(accounts).map((account) => account.id)).toEqual(["bank"]);
  });
});
