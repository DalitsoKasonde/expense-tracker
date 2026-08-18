import { beforeEach, describe, expect, it } from "vitest";
import {
  recallAccountForEntryKind,
  recallFeesForAccount,
  rememberAccountForEntryKind,
  rememberFeeForAccount,
} from "./entry-preferences";

/** jsdom here runs without localStorage, so the tests provide one. */
function installStorage(store: Map<string, string> | null) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: store
      ? {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => void store.set(key, value),
        }
      : {
          getItem: () => {
            throw new Error("storage blocked");
          },
          setItem: () => {
            throw new Error("storage blocked");
          },
        },
  });
}

describe("remembering the account per entry kind", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    installStorage(store);
  });

  it("offers back the account last used for that kind", () => {
    rememberAccountForEntryKind("expense_living", "airtel");

    expect(recallAccountForEntryKind("expense_living")).toBe("airtel");
  });

  it("keeps each entry kind separate", () => {
    // Spending usually comes from a wallet, income usually lands in a bank.
    rememberAccountForEntryKind("expense_living", "airtel");
    rememberAccountForEntryKind("income_earned", "bank");

    expect(recallAccountForEntryKind("expense_living")).toBe("airtel");
    expect(recallAccountForEntryKind("income_earned")).toBe("bank");
  });

  it("returns nothing for a kind never recorded", () => {
    expect(recallAccountForEntryKind("saving_transfer")).toBeUndefined();
  });

  it("survives a corrupt stored value instead of throwing during render", () => {
    store.set("expenses.lastAccountByEntryKind", "not json");

    expect(recallAccountForEntryKind("expense_living")).toBeUndefined();
    expect(() => rememberAccountForEntryKind("expense_living", "airtel")).not.toThrow();
  });

  it("does nothing when storage is blocked", () => {
    installStorage(null);

    expect(() => rememberAccountForEntryKind("expense_living", "airtel")).not.toThrow();
    expect(recallAccountForEntryKind("expense_living")).toBeUndefined();
  });
});

describe("remembering fees per account", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    installStorage(store);
  });

  it("offers recent fees most recent first", () => {
    rememberFeeForAccount("airtel", 250);
    rememberFeeForAccount("airtel", 500);

    expect(recallFeesForAccount("airtel")).toEqual([500, 250]);
  });

  it("does not repeat a fee that is used again, but moves it to the front", () => {
    rememberFeeForAccount("airtel", 250);
    rememberFeeForAccount("airtel", 500);
    rememberFeeForAccount("airtel", 250);

    expect(recallFeesForAccount("airtel")).toEqual([250, 500]);
  });

  it("keeps at most three suggestions", () => {
    for (const fee of [100, 200, 300, 400]) {
      rememberFeeForAccount("airtel", fee);
    }

    expect(recallFeesForAccount("airtel")).toEqual([400, 300, 200]);
  });

  it("never suggests a zero fee", () => {
    // "No fee" is the empty state, not something to offer back.
    rememberFeeForAccount("cash", 0);

    expect(recallFeesForAccount("cash")).toEqual([]);
  });

  it("keeps accounts separate", () => {
    rememberFeeForAccount("airtel", 250);
    rememberFeeForAccount("momo", 700);

    expect(recallFeesForAccount("airtel")).toEqual([250]);
    expect(recallFeesForAccount("momo")).toEqual([700]);
  });

  it("ignores a corrupt stored value", () => {
    store.set("expenses.recentFeesByAccount", JSON.stringify({ airtel: "nonsense" }));

    expect(recallFeesForAccount("airtel")).toEqual([]);
  });
});
