import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssetDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
  assetClass: "stock",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ assetId: "asset-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

vi.mock("@/lib/use-unified-dashboard", () => ({
  useUnifiedDashboard: () => ({
    loading: false,
    reload: mocks.reload,
    data: {
      currency: "ZMW",
      assets: [{
        assetId: "asset-1",
        name: "Zanaco",
        symbol: "ZNCO",
        assetClass: mocks.assetClass,
        currency: "ZMW",
        investedAmountMinor: 10_000,
        currentValueMinor: 11_000,
        hasPosition: true,
      }],
    },
  }),
}));

describe("AssetDetailPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.assetClass = "stock";
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") return Promise.resolve([]);
      if (path === "/v1/assets/asset-1/holding") {
        return Promise.resolve({
          quantity: 10,
          totalCost: 10_000,
          avgCostBasis: 1_000,
          unrealizedPnl: 1_000,
          currentValueMinor: 11_000,
          lots: [{
            id: "lot-1",
            quantity: 5,
            remainingQuantity: 5,
            unitPrice: 200,
            fees: 12,
            totalCost: 1012,
            acquisitionDate: "2026-08-01",
          }],
        });
      }
      if (path.startsWith("/v1/transactions")) return Promise.resolve([]);
      if (path === "/v1/market-data/luse") {
        return Promise.resolve({ stocks: [], updatedAt: "", sourceName: "Mansa Markets", sourceUrl: "https://www.mansamarkets.com/zambia/" });
      }
      if (path === "/v1/assets/asset-1" && options?.method === "DELETE") return Promise.resolve(undefined);
      if (path === "/v1/assets/asset-1" && options?.method === "PATCH") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("places a stock under the stocks category in the breadcrumb trail", () => {
    render(<AssetDetailPage />);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Stocks" })).toHaveAttribute("href", "/investments/stocks");
    expect(within(trail).getAllByRole("listitem").map((item) => item.textContent?.replace(/^\//, "").trim())).toEqual([
      "Home",
      "Portfolio",
      "Stocks",
      "Zanaco",
    ]);
  });

  it("places a bond under the bonds category in the breadcrumb trail", () => {
    mocks.assetClass = "bond";
    render(<AssetDetailPage />);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Government bonds" })).toHaveAttribute("href", "/investments/bonds");
  });

  it("deletes a mistaken investment after confirmation", async () => {
    render(<AssetDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete investment" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Zanaco?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete investment" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/assets/asset-1", { method: "DELETE" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/investments");
  });

  it("edits an investment without changing its accounting currency", async () => {
    render(<AssetDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit investment" }));
    fireEvent.change(screen.getByLabelText("Investment name"), { target: { value: "Zanaco Plc" } });
    fireEvent.change(screen.getByLabelText("Ticker symbol (optional)"), { target: { value: "ZNCO" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/assets/asset-1", {
        method: "PATCH",
        body: {
          name: "Zanaco Plc",
          symbol: "ZNCO",
          assetClass: "stock",
          currency: "ZMW",
        },
      }),
    );
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("shows each stock purchase lot with its one-off brokerage fee", async () => {
    render(<AssetDetailPage />);

    expect(await screen.findByRole("heading", { name: "Purchase lots" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("5.0000")).toHaveLength(2);
    expect(within(table).getByText("ZMW 2.00")).toBeInTheDocument();
    expect(within(table).getByText("ZMW 0.12")).toBeInTheDocument();
    expect(within(table).getByText("ZMW 10.12")).toBeInTheDocument();
    expect(within(table).getByText("ZMW 2.02")).toBeInTheDocument();
    expect(screen.getByText("Average cost per share")).toBeInTheDocument();
    expect(screen.getByText("Includes allocated brokerage fees.")).toBeInTheDocument();
  });

  it("links from an existing stock to the add-investment form", async () => {
    render(<AssetDetailPage />);

    expect(screen.getByRole("link", { name: /Add another investment/ })).toHaveAttribute(
      "href",
      "/investments/add",
    );
  });
});
