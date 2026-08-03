import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavingsPocketsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

const pocket = {
  id: "pocket-1",
  accountId: "account-1",
  name: "Patumba Pocket",
  currency: "ZMW",
  annualInterestRateBps: 1250,
  currentBalanceMinor: 10_500,
  netContributionsMinor: 10_000,
  interestEarnedMinor: 500,
};

describe("SavingsPocketsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/savings-pockets") return Promise.resolve(options?.method === "POST" ? pocket : [pocket]);
      if (path === "/v1/accounts") return Promise.resolve([
        { id: "account-1", name: "Patumba Pocket", accountType: "savings", accountClass: "asset", currency: "ZMW" },
        { id: "account-2", name: "Fixed savings", accountType: "savings", accountClass: "asset", currency: "ZMW" },
      ]);
      if (path === "/v1/savings-pockets/pocket-1/interest" && options?.method === "POST") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("shows pocket value, contributions, interest and advertised rate", async () => {
    render(<SavingsPocketsPage />);
    expect(await screen.findByText("Patumba Pocket")).toBeInTheDocument();
    expect(screen.getByText("12.50% p.a.")).toBeInTheDocument();
    expect(screen.getByText(/105\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Interest earned/).parentElement).toHaveTextContent(/5\.00/);
  });

  it("records credited interest directly into the pocket", async () => {
    render(<SavingsPocketsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add interest" }));
    fireEvent.change(screen.getByLabelText("Interest amount (ZMW)"), { target: { value: "2.50" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Monthly credit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save interest" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/savings-pockets/pocket-1/interest",
      { method: "POST", body: { transactionDate: expect.any(String), amountMinor: 250, note: "Monthly credit" } },
    ));
  });

  it("can promote an existing standalone savings account into Investments", async () => {
    render(<SavingsPocketsPage />);
    fireEvent.change(await screen.findByLabelText("Existing savings account"), { target: { value: "account-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Investments" }));
    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/savings-pockets",
      { method: "POST", body: { existingAccountId: "account-2" } },
    ));
  });
});
