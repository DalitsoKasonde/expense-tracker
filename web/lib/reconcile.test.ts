import { describe, expect, it } from "vitest";
import { UNACCOUNTED_NOTE, reconcile, unaccountedSpendingPayload } from "./reconcile";

describe("reconciling a balance", () => {
  it("reports a match when the account agrees", () => {
    expect(reconcile(10076, 10076)).toEqual({ outcome: "match" });
  });

  it("treats less money than tracked as unrecorded spending", () => {
    expect(reconcile(50000, 42050)).toEqual({ outcome: "shortfall", amountMinor: 7950 });
  });

  it("treats more money than tracked as a surplus, never as spending", () => {
    expect(reconcile(42050, 50000)).toEqual({ outcome: "surplus", amountMinor: 7950 });
  });

  it("works for an overdrawn account", () => {
    expect(reconcile(-1000, -2500)).toEqual({ outcome: "shortfall", amountMinor: 1500 });
  });
});

describe("recording a shortfall", () => {
  it("books one living expense in the account's currency, under a findable note", () => {
    expect(unaccountedSpendingPayload({ id: "airtel", currency: "ZMW" }, 7950, "2026-09-30")).toEqual({
      transactionDate: "2026-09-30",
      entryKind: "expense_living",
      amount: 7950,
      currency: "ZMW",
      accountId: "airtel",
      note: UNACCOUNTED_NOTE,
      source: "manual",
    });
  });

  it("refuses anything but a positive shortfall", () => {
    expect(() => unaccountedSpendingPayload({ id: "a", currency: "ZMW" }, 0, "2026-09-30")).toThrow();
    expect(() => unaccountedSpendingPayload({ id: "a", currency: "ZMW" }, -5, "2026-09-30")).toThrow();
  });
});
