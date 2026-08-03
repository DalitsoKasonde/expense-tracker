import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoansWorkspace } from "./loans-workspace";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-user-currency", () => ({ useUserCurrency: () => ({ currency: "ZMW" }) }));

const account = { id: "cash-1", name: "FNB", accountType: "bank", accountClass: "asset", currency: "ZMW" };
const group = { id: "group-1", name: "SL Group", currency: "ZMW", contributedMinor: 30_000, currentBalance: 30_000 };

describe("loans workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/loans") return Promise.resolve([]);
      if (path === "/v1/accounts") return Promise.resolve([account]);
      if (path === "/v1/savings-groups") return Promise.resolve([group]);
      return Promise.resolve({});
    });
  });

  it("adds a savings-group loan and sends the proceeds to the selected account", async () => {
    render(<LoansWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Add loan" }));
    const dialog = screen.getByRole("dialog", { name: "Add loan" });
    fireEvent.change(within(dialog).getByLabelText("Amount received"), { target: { value: "245" } });
    fireEvent.change(within(dialog).getByLabelText("Total fixed interest (optional)"), { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add loan" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/loans", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({
        creditorName: "SL Group",
        groupId: "group-1",
        cashAccountId: "cash-1",
        initialAmountMinor: 24_500,
        fixedInterestMinor: 2_500,
      }),
    })));
  });

  it("explains that a linked repayment returns to the group", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/loans") return Promise.resolve([{
        id: "loan-1", creditorName: "SL Group", loanType: "forced", isForced: true,
        groupId: "group-1", status: "active", principalBorrowed: 20_000,
        remainingPrincipal: 20_000, outstandingInterest: 2_000, outstandingFees: 0,
        totalRemainingBalance: 22_000, interestAndFeesPaid: 0, availablePayoffPriority: "forced",
      }]);
      if (path === "/v1/accounts") return Promise.resolve([account]);
      if (path === "/v1/savings-groups") return Promise.resolve([group]);
      return Promise.resolve({});
    });

    render(<LoansWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Record repayment" }));
    expect(screen.getByRole("dialog", { name: "Repay SL Group" })).toHaveTextContent("increase SL Group's balance");
  });
});
