import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddInvestmentPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "ZMW", loading: false }),
}));

describe("AddInvestmentPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "cash-zmw", name: "Main bank", accountClass: "asset", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/investment-types") return Promise.resolve([]);
      if (path === "/v1/assets") {
        return Promise.resolve([
          { id: "stock-1", name: "Zanaco", symbol: "ZANACO", assetClass: "stock", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/bonds") {
        return Promise.resolve([
          {
            assetId: "bond-1",
            name: "GRZ 3-year bond",
            symbol: "GRZ-3Y",
            currency: "ZMW",
            issueDate: "2026-01-01",
            maturityDate: "2029-01-01",
            couponRateBps: 1500,
          },
        ]);
      }
      if (path === "/v1/market-data/luse") {
        return Promise.resolve({
          stocks: [{ ticker: "ATEL", name: "Airtel Networks Zambia", currency: "ZMW", priceMinor: 19_499 }],
          updatedAt: "2026-07-31T10:55:05Z",
          sourceName: "Mansa Markets",
          sourceUrl: "https://www.mansamarkets.com/zambia/",
        });
      }
      if (path === "/v1/bonds/bond-1/purchases" && options?.method === "POST") return Promise.resolve({});
      if (path === "/v1/transactions" && options?.method === "POST") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("adds another purchase lot to an existing stock", async () => {
    render(<AddInvestmentPage />);

    expect(await screen.findByRole("button", { name: "Existing stock" })).toHaveClass("active");
    expect(screen.getByRole("combobox", { name: "Stock" })).toHaveValue("stock-1");
    expect(screen.queryByLabelText("Company or fund name")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Shares purchased"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Price per share (ZMW)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add purchase to stock" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({
          assetId: "stock-1",
          accountId: "cash-zmw",
          quantity: 10,
          unitPrice: 500,
        }),
      }),
    );
    expect(mocks.apiCall).not.toHaveBeenCalledWith("/v1/assets", expect.objectContaining({ method: "POST" }));
    expect(mocks.push).toHaveBeenCalledWith("/investments");
  });

  it("fills new-stock details from the LuSE directory", async () => {
    render(<AddInvestmentPage />);

    fireEvent.click(await screen.findByRole("button", { name: "New stock" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "LuSE-listed stock (optional)" }), {
      target: { value: "ATEL" },
    });

    expect(screen.getByLabelText("Company or fund name")).toHaveValue("Airtel Networks Zambia");
    expect(screen.getByLabelText("Ticker symbol (optional)")).toHaveValue("ATEL");
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("ZMW");
  });

  it("adds principal to an existing government bond", async () => {
    render(<AddInvestmentPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Government bond" }));
    fireEvent.click(screen.getByRole("button", { name: "Existing bond" }));

    expect(screen.getByLabelText("Government bond")).toHaveValue("bond-1");
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Additional principal (ZMW)"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Purchase charge / fee (ZMW)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add purchase to bond" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/bonds/bond-1/purchases", {
        method: "POST",
        body: expect.objectContaining({
          cashAccountId: "cash-zmw",
          principalMinor: 100000,
          purchaseFeeMinor: 1000,
          purchaseDate: expect.any(String),
        }),
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/investments");
  });
});
