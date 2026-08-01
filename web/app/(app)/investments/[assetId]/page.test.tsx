import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssetDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
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
        assetClass: "stock",
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
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") return Promise.resolve([]);
      if (path === "/v1/assets/asset-1/holding") {
        return Promise.resolve({ quantity: 10, totalCost: 10_000, avgCostBasis: 1_000, unrealizedPnl: 1_000, currentValueMinor: 11_000 });
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
});
