import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StocksDashboardPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  dashboard: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-unified-dashboard", () => ({ useUnifiedDashboard: () => mocks.dashboard() }));

describe("StocksDashboardPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.reload.mockReset();
    mocks.dashboard.mockReturnValue({
      data: {
        currency: "ZMW",
        assets: [{
          assetId: "stock-1",
          name: "Zambeef",
          symbol: "ZMBF",
          assetClass: "stock",
          currency: "ZMW",
          investedAmountMinor: 10_000,
          currentValueMinor: 10_000,
          hasPosition: true,
        }],
      },
      loading: false,
      reload: mocks.reload,
    });
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/investments/holdings") return Promise.resolve([{ assetId: "stock-1", quantity: 10, totalCost: 10_000, currentValue: 10_000 }]);
      if (path === "/v1/market-data/luse") return Promise.resolve({
        stocks: [{ ticker: "ZMBF", name: "Zambeef", currency: "ZMW", priceMinor: 2_000 }],
        updatedAt: "2026-08-03T08:00:00Z",
        sourceName: "Mansa Markets",
        sourceUrl: "https://mansaapi.com",
      });
      if (path === "/v1/assets/stock-1/valuations") return Promise.resolve({});
      if (path === "/v1/investments/dividends/summary") return Promise.resolve([{
        currency: "ZMW",
        dividendsReceivedMinor: 1_500,
        dividendsCount: 2,
        reinvestedMinor: 500,
        paidToCashMinor: 1_000,
        payingStockCount: 1,
      }]);
      return Promise.resolve([]);
    });
  });

  it("gets all market prices from one directory request and records the new value", async () => {
    render(<StocksDashboardPage />);

    await screen.findByText(/10 shares/);
    fireEvent.click(screen.getByRole("button", { name: "Get market price" }));

    await screen.findByText(/1 holding updated/);
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/market-data/luse");
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/assets/stock-1/valuations", {
      method: "POST",
      body: {
        valuationDate: "2026-08-03",
        currentValueMinor: 20_000,
        currency: "ZMW",
        source: "mansa_market",
      },
    });
    expect(screen.getByText("Portfolio growth")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/200\.00/).length).toBeGreaterThan(0));
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("shows dividend income beside the growth figure rather than folded into it", async () => {
    render(<StocksDashboardPage />);

    await screen.findByText("Dividend income received");
    await screen.findByText(/2 payments from 1 stock · 15\.0% of invested/);
    expect(screen.getByText(/5\.00 reinvested · .*10\.00 paid to cash/)).toBeInTheDocument();
    // Growth stays value less cost; the dividends must not have been added in.
    const summary = within(screen.getByLabelText("Stock portfolio summary"));
    expect(summary.getByText("Portfolio growth")).toBeInTheDocument();
    expect(summary.getByText("+ZMW 0.00")).toBeInTheDocument();
  });

  it("says when dividend income could not be loaded instead of showing a confident zero", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/investments/dividends/summary") return Promise.reject(new Error("offline"));
      if (path === "/v1/investments/holdings") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    render(<StocksDashboardPage />);

    await screen.findByText(/couldn.t load dividend income/);
    expect(screen.queryByText("No dividends paid yet")).not.toBeInTheDocument();
  });
});
