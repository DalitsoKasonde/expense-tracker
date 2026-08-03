import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvestmentsPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  dashboard: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-unified-dashboard", () => ({
  useUnifiedDashboard: () => mocks.dashboard(),
}));

const assets = [
  {
    assetId: "stock-1",
    name: "Zambeef",
    symbol: "ZMBF",
    assetClass: "stock",
    currency: "ZMW",
    investedAmountMinor: 100_000,
    currentValueMinor: 120_000,
    hasPosition: true,
  },
  {
    assetId: "bond-1",
    name: "GRZ 2029",
    symbol: null,
    assetClass: "bond",
    currency: "ZMW",
    investedAmountMinor: 500_000,
    currentValueMinor: 500_000,
    hasPosition: true,
  },
  {
    assetId: "stock-2",
    name: "Untraded",
    symbol: "UNT",
    assetClass: "stock",
    currency: "ZMW",
    investedAmountMinor: 0,
    currentValueMinor: 0,
    hasPosition: false,
  },
];

describe("InvestmentsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.dashboard.mockReset();
    mocks.dashboard.mockReturnValue({ data: { currency: "ZMW", assets }, loading: false });
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([{
        id: "group-1",
        name: "Chilimba",
        currency: "ZMW",
        isShareoutGroup: true,
        currentBalance: 50_000,
        contributedMinor: 45_000,
      }]);
      if (path === "/v1/savings-pockets") return Promise.resolve([{
        id: "pocket-1",
        accountId: "account-1",
        name: "Patumba Pocket",
        currency: "ZMW",
        currentBalanceMinor: 25_000,
        netContributionsMinor: 24_000,
        interestEarnedMinor: 1_000,
      }]);
      return Promise.resolve([]);
    });
  });

  it("links to a compact dashboard for every managed investment type", async () => {
    render(<InvestmentsPage />);

    expect(await screen.findByRole("link", { name: /Stocks/ })).toHaveAttribute("href", "/investments/stocks");
    expect(screen.getByRole("link", { name: /Government bonds/ })).toHaveAttribute("href", "/investments/bonds");
    expect(screen.getByRole("link", { name: /Savings pockets/ })).toHaveAttribute("href", "/investments/savings-pockets");
    await waitFor(() => expect(screen.getByRole("link", { name: /Savings groups/ })).toHaveAttribute("href", "/investments/savings-groups"));
    expect(screen.queryByText("Zambeef")).not.toBeInTheDocument();
    expect(screen.queryByText("GRZ 2029")).not.toBeInTheDocument();
  });

  it("keeps holdings with no position out of totals and summarizes them on the type card", async () => {
    render(<InvestmentsPage />);

    const summary = await screen.findByRole("region", { name: "Portfolio summary" });
    // 120,000 + 500,000 + 50,000 + 25,000 minor units, excluding the untraded stock.
    await waitFor(() =>
      expect(within(summary).getByText(/6,950\.00/)).toBeInTheDocument(),
    );
    expect(within(summary).getByText(/4 active holdings/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stocks/ })).toHaveTextContent("1 waiting");
  });

  it("never adds currencies together", async () => {
    mocks.dashboard.mockReturnValue({
      data: {
        currency: "ZMW",
        assets: [
          { ...assets[0], currency: "USD", currentValueMinor: 900_000, investedAmountMinor: 800_000 },
          assets[1],
        ],
      },
      loading: false,
    });
    mocks.apiCall.mockResolvedValue([]);

    render(<InvestmentsPage />);

    const summary = await screen.findByRole("region", { name: "Portfolio summary" });
    expect(within(summary).getByText(/\$9,000\.00|USD\s?9,000\.00/)).toBeInTheDocument();
    expect(within(summary).getByText(/5,000\.00/)).toBeInTheDocument();
    expect(within(summary).getAllByText(/9,000\.00|5,000\.00/)).toHaveLength(2);
  });
});
