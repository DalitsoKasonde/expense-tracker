import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssetDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
  assetClass: "stock",
  dividends: [] as Array<Record<string, unknown>>,
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
    mocks.dividends = [];
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
      if (path.startsWith("/v1/transactions")) return Promise.resolve(mocks.dividends);
      if (path === "/v1/market-data/luse") {
        return Promise.resolve({ stocks: [], updatedAt: "", sourceName: "Mansa Markets", sourceUrl: "https://www.mansamarkets.com/zambia/" });
      }
      if (path === "/v1/assets/asset-1" && options?.method === "DELETE") return Promise.resolve(undefined);
      if (path === "/v1/assets/asset-1" && options?.method === "PATCH") return Promise.resolve(undefined);
      if (path === "/v1/assets/asset-1/dividends" && options?.method === "POST") return Promise.resolve({});
      if (path === "/v1/bonds/asset-1/projection") return Promise.resolve({
        bond: {
          cashAccountId: "",
          principalMinor: 100_000,
          purchaseFeeMinor: 0,
          issueDate: "2024-01-01",
          maturityDate: "2028-01-01",
        },
        totalProjectedPayoutMinor: 126_000,
        totalGrossCouponMinor: 6_500,
        totalCouponTaxMinor: 500,
        totalCouponMinor: 6_000,
        totalCashBalanceMinor: 0,
        totalReinvestedMinor: 0,
        cashflows: [{
          id: "coupon-1",
          eventType: "coupon",
          disposition: "cash_balance",
          scheduledDate: "2025-08-01",
          grossAmountMinor: 6_500,
          taxAmountMinor: 500,
          netAmountMinor: 6_000,
          status: "projected",
        }],
      });
      if (path === "/v1/bonds/asset-1/cashflows/coupon-1/confirm" && options?.method === "POST") return Promise.resolve({});
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

  it("shows bond-specific summary cards instead of stock statistics", async () => {
    mocks.assetClass = "bond";
    render(<AssetDetailPage />);

    expect(await screen.findByText("Total purchase cost")).toBeInTheDocument();
    expect(screen.getByText("Projected net coupons")).toBeInTheDocument();
    expect(screen.getByText("Projected total payout")).toBeInTheDocument();
    expect(screen.getByText("Maturity date")).toBeInTheDocument();
    expect(screen.getAllByText("ZMW 1,260.00").length).toBeGreaterThan(0);
    expect(screen.getByText(new Date("2028-01-01T00:00:00").toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }))).toBeInTheDocument();
    expect(screen.queryByText("Shares owned")).not.toBeInTheDocument();
    expect(screen.queryByText("Average cost per share")).not.toBeInTheDocument();
    expect(screen.queryByText("Gain or loss")).not.toBeInTheDocument();
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

  it("counts dividends into the return, cost recovered and break-even price", async () => {
    mocks.dividends = [{
      id: "dividend-1",
      transactionDate: "2026-03-01",
      entryKind: "investment_income",
      originEventType: "equity_dividend",
      amount: 2_500,
      currency: "ZMW",
      assetId: "asset-1",
    }];
    render(<AssetDetailPage />);

    // Invested 100.00, worth 110.00, dividends 25.00 -> price +10.00, total +35.00 (35%).
    expect(await screen.findByText("+ZMW 35.00 (+35.0%)")).toBeInTheDocument();
    expect(screen.getByText("Price +ZMW 10.00 · Dividends ZMW 25.00")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    // (100.00 - 25.00) across 10 shares.
    expect(screen.getByText("Break-even price")).toBeInTheDocument();
    expect(screen.getByText("ZMW 7.50")).toBeInTheDocument();
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

  it("offers no reinvestment choice for a dividend that is happening now", async () => {
    render(<AssetDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Record a dividend/ }));
    const dialog = screen.getByRole("dialog", { name: "Record a dividend" });
    expect(within(dialog).queryByLabelText("What happened to the payment?")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/paid into your account/i)).toBeInTheDocument();

    // The choice only appears for a payment that already happened, where both
    // legs are in the past.
    fireEvent.change(within(dialog).getByLabelText("Date received"), { target: { value: "2025-08-01" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Record as a historical dividend/ }));
    expect(within(dialog).getByLabelText("What happened to the payment?")).toBeInTheDocument();
  });

  it("offers no reinvestment choice for a coupon that is happening now", async () => {
    mocks.assetClass = "bond";
    render(<AssetDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm coupon" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm coupon payment" });
    expect(within(dialog).queryByLabelText("Use net coupon for")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/paid into the settlement account/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Record as a historical coupon/ }));
    expect(within(dialog).getByLabelText("Use net coupon for")).toBeInTheDocument();
  });

  it("records a past dividend as historical without a cash account", async () => {
    render(<AssetDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Record a dividend/ }));
    const dialog = screen.getByRole("dialog", { name: "Record a dividend" });
    fireEvent.change(within(dialog).getByLabelText("Dividend amount (ZMW)"), { target: { value: "125.50" } });
    fireEvent.change(within(dialog).getByLabelText("Date received"), { target: { value: "2025-08-01" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Record as a historical dividend/ }));
    expect(within(dialog).getByText("No account will be changed")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save dividend" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/assets/asset-1/dividends",
      {
        method: "POST",
        body: {
          cashAccountId: undefined,
          amountMinor: 12_550,
          reinvestmentPriceMinor: undefined,
          dividendDisposition: "cash",
          currency: "ZMW",
          executionDate: "2025-08-01",
          note: undefined,
          historicalBackfill: true,
        },
      },
    ));
  });

  it("records a past coupon as historical without a settlement account", async () => {
    mocks.assetClass = "bond";
    render(<AssetDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm coupon" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm coupon payment" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Record as a historical coupon/ }));
    expect(within(dialog).getByText("No account will be changed")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm coupon" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/bonds/asset-1/cashflows/coupon-1/confirm",
      {
        method: "POST",
        body: {
          cashAccountId: undefined,
          grossAmountMinor: 6_500,
          taxAmountMinor: 500,
          paymentDate: "2025-08-01",
          destination: "cash",
          destinationAssetId: undefined,
          unitPriceMinor: undefined,
          purchaseFeeMinor: undefined,
          historicalBackfill: true,
        },
      },
    ));
  });
});
