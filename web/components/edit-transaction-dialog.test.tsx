import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditTransactionDialog } from "./edit-transaction-dialog";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

describe("EditTransactionDialog", () => {
  beforeEach(() => mocks.apiCall.mockReset());

  it("updates the date, amount, account, category, and note", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    mocks.apiCall.mockResolvedValue({
      id: "tx-1",
      transactionDate: "2026-08-03",
      entryKind: "expense_living",
      amount: 12500,
      currency: "ZMW",
      accountId: "bank",
      categoryId: "transport",
      note: "Taxi",
    });

    render(
      <EditTransactionDialog
        transaction={{
          id: "tx-1",
          transactionDate: "2026-08-02",
          entryKind: "expense_living",
          amount: 10000,
          currency: "ZMW",
          accountId: "cash",
          categoryId: "food",
          source: "manual",
        }}
        accounts={[
          { id: "cash", name: "Cash", accountType: "cash", accountClass: "asset", currency: "ZMW" },
          { id: "bank", name: "Bank", accountType: "bank", accountClass: "asset", currency: "ZMW" },
        ]}
        categories={[
          { id: "food", name: "Food", categoryGroup: "expense" },
          { id: "transport", name: "Transport", categoryGroup: "expense" },
        ]}
        onSaved={onSaved}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-08-03" } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "bank" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "transport" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Taxi" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions/tx-1", {
      method: "PATCH",
      body: expect.objectContaining({
        transactionDate: "2026-08-03",
        entryKind: "expense_living",
        amount: 12500,
        accountId: "bank",
        categoryId: "transport",
        note: "Taxi",
      }),
    }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ categoryName: "Transport" }));
    expect(onClose).toHaveBeenCalled();
  });
});
