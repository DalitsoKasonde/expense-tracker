import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddEntryDialog } from "./add-entry-dialog";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "test-token" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));
vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "ZMW", loading: false }),
}));
vi.mock("@/lib/offline-db", () => ({
  queuePendingTransaction: vi.fn(),
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

describe("AddEntryDialog", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([{ id: "account-1", name: "Mobile Money", accountClass: "asset", currency: "ZMW" }]);
      return Promise.resolve([]);
    });
  });

  it("asks what happened before showing transaction details", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "What happened?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I spent money" }));
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid from")).toBeInTheDocument();
    expect(screen.queryByText("Destination")).not.toBeInTheDocument();
  });

  it("does not offer a savings-group ledger as a payment account", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([
        { id: "group", name: "SL Savings", accountType: "savings", accountClass: "asset", currency: "ZMW", isSavingsGroupAccount: true },
        { id: "cash", name: "Cash", accountType: "cash", accountClass: "asset", currency: "ZMW" },
      ]);
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I spent money" }));

    const source = screen.getByRole("combobox", { name: "Paid from" });
    expect(source).toHaveTextContent("Cash");
    expect(source).not.toHaveTextContent("SL Savings");
  });

  it("shows category hierarchy as readable paths", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "account-1", name: "Mobile Money", accountType: "mobile_money", accountClass: "asset", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/categories") {
        return Promise.resolve([
          { id: "bundles", name: "Data Bundles", categoryGroup: "expense", parentId: null },
          { id: "weekly", name: "Weekly", categoryGroup: "expense", parentId: "bundles" },
          { id: "salary", name: "Salary", categoryGroup: "income", parentId: null },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I spent money" }));

    const picker = await screen.findByRole("combobox", { name: "Choose category" });
    expect(picker).toHaveTextContent("Data Bundles");
    expect(picker).toHaveTextContent("Data Bundles › Weekly");
    expect(picker).not.toHaveTextContent("Salary");
  });

  it("creates and selects an income category inline without asking for an income source", async () => {
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "account-1", name: "Cash", accountType: "cash", accountClass: "asset", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/categories" && options?.method === "POST") {
        return Promise.resolve({ id: "salary", name: "Salary", categoryGroup: "income", parentId: null });
      }
      if (path === "/v1/categories") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I received money" }));

    expect(screen.queryByLabelText("Income source")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add category" }));
    fireEvent.change(screen.getByLabelText("New category"), { target: { value: "Salary" } });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/categories", {
        method: "POST",
        body: { name: "Salary", categoryGroup: "income" },
      }),
    );
    expect(screen.getByLabelText("Choose category")).toHaveValue("salary");

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({
          entryKind: "income_earned",
          categoryId: "salary",
        }),
      }),
    );
    const transactionCall = mocks.apiCall.mock.calls.find(([path]) => path === "/v1/transactions");
    expect(transactionCall?.[1]?.body).not.toHaveProperty("incomeSourceId");
  });

  it("creates stocks and government bonds without leaving quick add", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I bought an investment" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I bought an investment" }));

    expect(screen.getByRole("button", { name: "New stock" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New government bond" }));
    expect(screen.getByLabelText("Bond name")).toBeInTheDocument();
    expect(screen.getByLabelText("Annual coupon rate (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Purchase charge / fee")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Issue date"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Term (years)"), { target: { value: "3" } });
    expect(screen.getByLabelText("Maturity date")).toHaveValue("2029-01-01");
    expect(screen.queryByText("Create an asset first")).not.toBeInTheDocument();
  });

  it("shows an explicit purchase date for stock purchases", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I bought an investment" }));

    expect(screen.getByLabelText("Purchase date")).toBeInTheDocument();
  });

  it("calculates stock purchase cost from shares, price, and broker fees", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I bought an investment" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I bought an investment" }));

    fireEvent.change(screen.getByLabelText("Shares purchased"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Price per share/), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText(/Broker fees/), { target: { value: "10" } });

    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Calculated stock purchase total")).toHaveTextContent(/2,510\.00/);
  });

  it("mirrors the portfolio form's listed-stock picker and currency matching", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "zmw-account", name: "Kwacha account", accountType: "bank", accountClass: "asset", currency: "ZMW" },
          { id: "usd-account", name: "Dollar account", accountType: "bank", accountClass: "asset", currency: "USD" },
        ]);
      }
      if (path === "/v1/market-data/luse") {
        return Promise.resolve({
          stocks: [{ ticker: "TEST", name: "Test Holdings", currency: "USD", priceMinor: 1250 }],
          updatedAt: "2026-08-01T00:00:00Z",
          sourceName: "Mansa",
          sourceUrl: "https://example.com",
        });
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I bought an investment" }));

    fireEvent.change(screen.getByLabelText("LuSE-listed stock (optional)"), {
      target: { value: "TEST" },
    });

    expect(screen.getByLabelText("Company or fund name")).toHaveValue("Test Holdings");
    expect(screen.getByLabelText("Ticker symbol (optional)")).toHaveValue("TEST");
    await waitFor(() => expect(screen.getByLabelText("Currency")).toHaveValue("USD"));
    expect(screen.getByLabelText("Paid from account")).toHaveValue("usd-account");
  });

  it("uses an existing stock's currency and adds the purchase as a new lot", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "zmw-account", name: "Kwacha account", accountType: "bank", accountClass: "asset", currency: "ZMW" },
          { id: "usd-account", name: "Dollar account", accountType: "bank", accountClass: "asset", currency: "USD" },
        ]);
      }
      if (path === "/v1/assets") {
        return Promise.resolve([
          { id: "stock-1", name: "Existing Holding", symbol: "EX", assetClass: "stock", currency: "USD" },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I bought an investment" }));

    expect(screen.getByLabelText("Stock")).toHaveValue("stock-1");
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText("Paid from account")).toHaveValue("usd-account"));
    expect(screen.getByText(/new lot under the selected holding/i)).toBeInTheDocument();
  });

  it("adds principal to an existing government bond from quick add", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "account-1", name: "Main bank", accountType: "bank", accountClass: "asset", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/bonds") {
        return Promise.resolve([
          { assetId: "bond-1", name: "GRZ 3-year bond", symbol: "GRZ-3Y", currency: "ZMW", maturityDate: "2029-01-01" },
        ]);
      }
      if (path === "/v1/bonds/bond-1/purchases") return Promise.resolve({});
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I bought an investment" }));
    fireEvent.click(screen.getByRole("button", { name: "Existing government bond" }));

    expect(screen.getByLabelText("Government bond")).toHaveValue("bond-1");
    fireEvent.change(screen.getByLabelText("Principal"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Purchase charge / fee (ZMW)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/bonds/bond-1/purchases", {
        method: "POST",
        body: expect.objectContaining({
          cashAccountId: "account-1",
          principalMinor: 100000,
          purchaseFeeMinor: 1000,
        }),
      }),
    );
  });

  it("moves money between active same-currency asset accounts", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "account-1", name: "Mobile Money", accountClass: "asset", currency: "ZMW" },
          { id: "account-2", name: "Bank account", accountClass: "asset", currency: "ZMW" },
          { id: "account-3", name: "Dollar account", accountClass: "asset", currency: "USD" },
          { id: "account-4", name: "Credit card", accountClass: "liability", currency: "ZMW" },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I transferred money" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I transferred money" }));

    expect(screen.getByLabelText("From account")).toHaveValue("account-1");
    const destination = screen.getByLabelText("To account");
    expect(destination).toHaveValue("account-2");
    expect(destination).toHaveTextContent("Bank account");
    expect(destination).not.toHaveTextContent("Dollar account");
    expect(destination).not.toHaveTextContent("Credit card");
  });

  it("records past savings without reducing a source account", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          {
            id: "account-1",
            name: "Main bank",
            accountType: "bank",
            accountClass: "asset",
            currency: "ZMW",
          },
          {
            id: "savings-1",
            name: "Emergency savings",
            accountType: "savings",
            accountClass: "asset",
            currency: "ZMW",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I transferred money" }));
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2020-01-10" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /record as historical without a funding account/i,
      }),
    );
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500" } });
    expect(screen.queryByLabelText("From account")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Savings account")).toHaveValue("savings-1");

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({
          entryKind: "saving_transfer",
          amount: 50000,
          accountId: undefined,
          destinationAccountId: "savings-1",
          historicalBackfill: true,
        }),
      }),
    );
  });

  it("records a past expense without a funding account", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I spent money" }));
    expect(screen.getByLabelText("Paid from")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2020-03-04" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /record as historical without a funding account/i,
      }),
    );
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    expect(screen.queryByLabelText("Paid from")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({
          entryKind: "expense_living",
          amount: 25000,
          accountId: undefined,
          historicalBackfill: true,
        }),
      }),
    );
  });

  it("keeps the funding account required for a dated-today expense", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I spent money" }));

    // The checkbox only appears for past dates: a today-dated expense has to move
    // money out of a real account.
    expect(
      screen.queryByRole("checkbox", {
        name: /record as historical without a funding account/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Paid from")).toBeRequired();
  });

  it("records money lent as a transfer into a receivable asset", async () => {
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts" && options?.method === "POST") {
        return Promise.resolve({
          id: "receivable-1",
          name: "Loan to John — school fees",
          accountType: "receivable",
          accountClass: "asset",
          currency: "ZMW",
        });
      }
      if (path === "/v1/accounts") {
        return Promise.resolve([
          {
            id: "account-1",
            name: "Mobile Money",
            accountType: "mobile_money",
            accountClass: "asset",
            currency: "ZMW",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "I lent someone money" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Person or loan name"), {
      target: { value: "John — school fees" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/accounts", {
        method: "POST",
        body: {
          name: "Loan to John — school fees",
          accountType: "receivable",
          accountClass: "asset",
          currency: "ZMW",
          openingBalanceMinor: 0,
        },
      }),
    );
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
      method: "POST",
      body: expect.objectContaining({
        entryKind: "loan_receivable_advance",
        amount: 25000,
        accountId: "account-1",
        destinationAccountId: "receivable-1",
      }),
    });
  });

  it("records repayment as a transfer from the receivable back into cash", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          {
            id: "account-1",
            name: "Mobile Money",
            accountType: "mobile_money",
            accountClass: "asset",
            currency: "ZMW",
          },
          {
            id: "receivable-1",
            name: "Loan to John",
            accountType: "receivable",
            accountClass: "asset",
            currency: "ZMW",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Someone repaid me" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({
          entryKind: "loan_receivable_repayment",
          amount: 10000,
          accountId: "receivable-1",
          destinationAccountId: "account-1",
        }),
      }),
    );
  });
});
