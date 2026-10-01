import { beforeEach, describe, expect, it } from "vitest";
import {
  editRow,
  isBlankRow,
  loadDraft,
  nextRow,
  parseAmountMinor,
  rowPayload,
  rowProblem,
  saveDraft,
  sheetTotals,
  type CatchUpRow,
} from "./catch-up";

const accounts = [
  { id: "airtel", currency: "ZMW" },
  { id: "usd-card", currency: "USD" },
];
const categories = [
  { id: "food", categoryGroup: "expense" },
  { id: "salary", categoryGroup: "income" },
];

function row(patch: Partial<CatchUpRow> = {}): CatchUpRow {
  return {
    id: "row-1",
    kind: "expense_living",
    transactionDate: "2026-09-10",
    amount: "85",
    accountId: "airtel",
    categoryId: "",
    transactionFee: "",
    note: "",
    ...patch,
  };
}

describe("parsing amounts", () => {
  it("never passes through a float", () => {
    // parseFloat("0.29") * 100 is 28.999…, the bug this parser exists to avoid.
    expect(parseAmountMinor("0.29")).toBe(29);
    expect(parseAmountMinor("1.1")).toBe(110);
  });

  it("accepts thousands separators as they appear on statements", () => {
    expect(parseAmountMinor("1,250.50")).toBe(125050);
  });

  it("rejects what is not an amount", () => {
    expect(parseAmountMinor("")).toBeNull();
    expect(parseAmountMinor("-5")).toBeNull();
    expect(parseAmountMinor("1.234")).toBeNull();
    expect(parseAmountMinor("K50")).toBeNull();
  });
});

describe("adding a row", () => {
  it("continues the run above: same date, account and kind", () => {
    const previous = row({ kind: "income_earned", transactionDate: "2026-09-12", accountId: "usd-card", amount: "40", note: "x", categoryId: "salary", transactionFee: "2" });
    const next = nextRow(previous, { date: "2026-09-30", accountId: "airtel" }, "row-2");

    expect(next).toMatchObject({ kind: "income_earned", transactionDate: "2026-09-12", accountId: "usd-card" });
  });

  it("never copies the amount, fee, category or note", () => {
    const next = nextRow(row({ amount: "40", note: "lunch", categoryId: "food", transactionFee: "2" }), { date: "2026-09-30", accountId: "airtel" }, "row-2");

    expect(next).toMatchObject({ amount: "", note: "", categoryId: "", transactionFee: "" });
  });

  it("starts the first row on today and the default account", () => {
    expect(nextRow(undefined, { date: "2026-09-30", accountId: "airtel" }, "row-1")).toMatchObject({
      kind: "expense_living",
      transactionDate: "2026-09-30",
      accountId: "airtel",
    });
  });
});

describe("editing a row", () => {
  it("drops a category from the other group when the kind flips", () => {
    const edited = editRow(row({ categoryId: "food" }), { kind: "income_earned" }, categories);
    expect(edited.categoryId).toBe("");
  });

  it("keeps a category that still fits", () => {
    expect(editRow(row({ categoryId: "food" }), { amount: "90" }, categories).categoryId).toBe("food");
  });

  it("clears the previous save error, since the edit may have fixed it", () => {
    expect(editRow(row({ error: "rejected" }), { amount: "90" }, categories).error).toBeUndefined();
  });
});

describe("validating a row", () => {
  it("accepts an ordinary expense", () => {
    expect(rowProblem(row(), accounts, "2026-09-30")).toBeNull();
  });

  it("rejects a missing amount, an unknown account and a future date", () => {
    expect(rowProblem(row({ amount: "" }), accounts, "2026-09-30")).toMatch(/amount/);
    expect(rowProblem(row({ accountId: "archived" }), accounts, "2026-09-30")).toMatch(/account/);
    expect(rowProblem(row({ transactionDate: "2026-10-01" }), accounts, "2026-09-30")).toMatch(/future/);
  });

  it("treats an untouched row as blank so it is skipped, not rejected", () => {
    expect(isBlankRow(row({ amount: "" }))).toBe(true);
    expect(isBlankRow(row())).toBe(false);
  });
});

describe("the saved entry", () => {
  it("takes its currency from the account, never the sheet", () => {
    // An entry whose currency differs from its account's counts toward no balance.
    expect(rowPayload(row({ accountId: "usd-card" }), accounts).currency).toBe("USD");
  });

  it("sends minor units, and omits an empty fee, category and note", () => {
    expect(rowPayload(row({ amount: "85.50", note: "  " }), accounts)).toEqual({
      transactionDate: "2026-09-10",
      entryKind: "expense_living",
      amount: 8550,
      currency: "ZMW",
      accountId: "airtel",
      categoryId: undefined,
      transactionFee: undefined,
      note: undefined,
      source: "manual",
    });
  });

  it("sends a fee so the API records it as its own linked entry", () => {
    expect(rowPayload(row({ transactionFee: "2.50" }), accounts).transactionFee).toBe(250);
  });
});

describe("totals", () => {
  it("never adds amounts across currencies", () => {
    const totals = sheetTotals(
      [row({ amount: "100", transactionFee: "2" }), row({ amount: "10", accountId: "usd-card" }), row({ kind: "income_earned", amount: "50" })],
      accounts,
    );
    expect(totals).toEqual([
      { currency: "ZMW", spent: 10000, received: 5000, fees: 200 },
      { currency: "USD", spent: 1000, received: 0, fees: 0 },
    ]);
  });
});

describe("the draft", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  it("survives closing the tab, without the stale save error", () => {
    saveDraft([row({ error: "rejected" }), row({ id: "blank", amount: "" })]);
    expect(loadDraft()).toEqual([{ ...row(), error: undefined }]);
  });

  it("ignores a stored value that is not ours", () => {
    store.set("expenses.catchUpDraft", JSON.stringify([{ id: 1 }, "junk"]));
    expect(loadDraft()).toEqual([]);
  });

  it("carries on without storage when it is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
        removeItem: () => { throw new Error("blocked"); },
      },
    });
    expect(() => saveDraft([row()])).not.toThrow();
    expect(loadDraft()).toEqual([]);
  });
});
