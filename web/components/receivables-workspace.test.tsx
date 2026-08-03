import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceivablesWorkspace } from "./receivables-workspace";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  dialogProps: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/components/add-entry-dialog", () => ({
  AddEntryDialog: (props: Record<string, unknown>) => {
    mocks.dialogProps(props);
    return props.open ? <div data-testid="add-entry-dialog" /> : null;
  },
}));

const accounts = [
  { id: "cash-1", name: "Cash", accountType: "cash", accountClass: "asset", currency: "ZMW" },
  { id: "recv-1", name: "Loan to Mwape", accountType: "receivable", accountClass: "asset", currency: "ZMW" },
  { id: "recv-2", name: "Loan to Chanda", accountType: "receivable", accountClass: "asset", currency: "ZMW" },
];

const transactions = [
  { id: "t1", transactionDate: "2026-05-01", entryKind: "loan_receivable_advance", amount: 200_000, accountId: "cash-1", destinationAccountId: "recv-1" },
  { id: "t2", transactionDate: "2026-06-12", entryKind: "loan_receivable_repayment", amount: 50_000, accountId: "recv-1", destinationAccountId: "cash-1" },
  { id: "t3", transactionDate: "2026-04-02", entryKind: "loan_receivable_advance", amount: 30_000, accountId: "cash-1", destinationAccountId: "recv-2" },
  { id: "t4", transactionDate: "2026-07-02", entryKind: "loan_receivable_repayment", amount: 30_000, accountId: "recv-2", destinationAccountId: "cash-1" },
  { id: "t5", transactionDate: "2026-07-03", entryKind: "expense_living", amount: 5_000, accountId: "cash-1" },
];

describe("ReceivablesWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve(accounts);
      if (path.startsWith("/v1/transactions")) return Promise.resolve(transactions);
      return Promise.resolve([]);
    });
  });

  it("shows what each person still owes and when they last paid", async () => {
    render(<ReceivablesWorkspace />);

    const mwape = (await screen.findByText("Mwape")).closest("tr");
    expect(mwape).not.toBeNull();
    expect(within(mwape!).getByText("ZMW 1,500.00")).toBeInTheDocument();
    expect(within(mwape!).getByText(/Lent ZMW 2,000.00 · repaid ZMW 500.00/)).toBeInTheDocument();

    // Only the person still owing counts toward the total and the headcount:
    // the row total and the stat card are the same 1,500.
    expect(screen.getAllByText("ZMW 1,500.00")).toHaveLength(2);
    expect(screen.getByText("1 outstanding")).toBeInTheDocument();
  });

  it("marks a person who has repaid in full as settled", async () => {
    render(<ReceivablesWorkspace />);

    const chanda = (await screen.findByText("Chanda")).closest("tr");
    expect(within(chanda!).getByText("settled")).toBeInTheDocument();
    expect(within(chanda!).getByText("ZMW 0.00")).toBeInTheDocument();
  });

  it("opens the repayment entry against the person on that row", async () => {
    render(<ReceivablesWorkspace />);

    const mwape = (await screen.findByText("Mwape")).closest("tr");
    fireEvent.click(within(mwape!).getByRole("button", { name: "Record repayment" }));

    expect(mocks.dialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        initialEntryKind: "loan_receivable_repayment",
        initialReceivableAccountId: "recv-1",
      }),
    );
  });

  it("opens a further advance with the person's name filled in", async () => {
    render(<ReceivablesWorkspace />);

    const mwape = (await screen.findByText("Mwape")).closest("tr");
    fireEvent.click(within(mwape!).getByRole("button", { name: "Lend more" }));

    expect(mocks.dialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        initialEntryKind: "loan_receivable_advance",
        initialCounterpartyName: "Mwape",
      }),
    );
  });
});
