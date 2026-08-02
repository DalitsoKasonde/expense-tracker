import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountCard } from "./account-card";
import { EmptyState } from "./empty-state";
import { SavingsGoalCard } from "./savings-goal-card";
import { TransactionFilters } from "./transaction-filters";
import { TransactionRow } from "./transaction-row";

describe("Expenses UI primitives", () => {
  it("renders an account in its own currency", () => {
    render(<AccountCard name="Dollar account" type="bank" balanceMinor={12345} currency="USD" />);
    expect(screen.getByText("Dollar account")).toBeInTheDocument();
    expect(screen.getByText(/123\.45/)).toBeInTheDocument();
  });

  it("keeps the primary account card readable on its tinted background", () => {
    render(<AccountCard name="Cash" type="cash" balanceMinor={800} currency="ZMW" primary />);

    expect(screen.getByRole("article")).toHaveClass("bg-primary-softer");
    expect(screen.getByText("Cash", { selector: "h3" })).toHaveClass("text-on-surface");
    expect(screen.getByText(/8\.00/)).toHaveClass("text-on-surface");
  });

  it("exposes savings progress accessibly", () => {
    render(<SavingsGoalCard name="Emergency fund" currentMinor={2500} targetMinor={10000} currency="ZMW" />);
    expect(screen.getByRole("progressbar", { name: /Emergency fund/i })).toHaveAttribute("aria-valuenow", "25");
  });

  it("shows pending transaction state", () => {
    render(<TransactionRow transaction={{ id: "1", transactionDate: "2026-06-19", entryKind: "expense_living", amount: 5000, currency: "ZMW", isPending: true }} />);
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
  });

  it("emits controlled filter changes", () => {
    const onChange = vi.fn();
    render(<TransactionFilters value={{ query: "", direction: "all" }} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Note or entry type"), { target: { value: "rent" } });
    expect(onChange).toHaveBeenCalledWith({ query: "rent", direction: "all" });
  });

  it("keeps transaction filters constrained to a mobile viewport", () => {
    render(<TransactionFilters
      value={{ query: "", direction: "all" }}
      onChange={vi.fn()}
      accounts={[{ id: "cash", name: "A very long account name", currency: "ZMW" }]}
      categories={[{ id: "food", name: "Food" }]}
    />);

    expect(screen.getByLabelText("Transaction filters")).toHaveClass("min-w-0", "w-full", "grid-cols-1");
    for (const field of screen.getAllByRole("combobox")) {
      expect(field).toHaveClass("w-full", "min-w-0", "max-w-full");
    }
  });

  it("renders empty state actions", () => {
    render(<EmptyState title="Nothing here" description="Add your first item." action={<button>Add item</button>} />);
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });
});
