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
    mocks.apiCall.mockResolvedValue([
      {
        id: "group-1",
        name: "Chilimba",
        currency: "ZMW",
        isShareoutGroup: true,
        currentBalance: 50_000,
        contributedMinor: 45_000,
      },
    ]);
  });

  it("lists every kind of holding in one page, grouped", async () => {
    render(<InvestmentsPage />);

    expect(await screen.findByText("Zambeef")).toBeInTheDocument();
    expect(screen.getByText("GRZ 2029")).toBeInTheDocument();
    // Savings groups sit alongside market holdings rather than in their own
    // disconnected section at the bottom of the page.
    await waitFor(() => expect(screen.getByText("Chilimba")).toBeInTheDocument());
    expect(screen.getByText("Stocks")).toBeInTheDocument();
    expect(screen.getByText("Government bonds")).toBeInTheDocument();
    expect(screen.getByText("Savings groups")).toBeInTheDocument();
  });

  it("keeps holdings with no position out of the totals but visible", async () => {
    render(<InvestmentsPage />);

    const summary = await screen.findByRole("region", { name: "Portfolio summary" });
    // 120,000 + 500,000 + 50,000 minor units, excluding the untraded stock.
    await waitFor(() =>
      expect(within(summary).getByText(/6,700\.00/)).toBeInTheDocument(),
    );
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Untraded")).toBeInTheDocument();
    expect(screen.getByText("Nothing bought yet")).toBeInTheDocument();
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
    expect(
      within(summary).getByText(/Currencies are never\s+added together/),
    ).toBeInTheDocument();
  });
});
