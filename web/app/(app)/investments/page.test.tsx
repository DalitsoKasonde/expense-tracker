import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InvestmentsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

vi.mock("@/lib/use-unified-dashboard", () => ({
  useUnifiedDashboard: () => ({
    loading: false,
    data: {
      currency: "ZMW",
      assets: [
        {
          assetId: "stock-1",
          name: "Zanaco",
          symbol: "ZNCO",
          assetClass: "stock",
          currency: "ZMW",
          investedAmountMinor: 10_000,
          currentValueMinor: 12_000,
          hasPosition: true,
        },
        {
          assetId: "bond-1",
          name: "GRZ Bond",
          symbol: "GRZ-3Y",
          assetClass: "bond",
          currency: "ZMW",
          investedAmountMinor: 3_000,
          currentValueMinor: 3_000,
          hasPosition: true,
        },
        {
          assetId: "empty-1",
          name: "Unfunded asset",
          assetClass: "stock",
          currency: "ZMW",
          investedAmountMinor: 0,
          currentValueMinor: 0,
          hasPosition: false,
        },
      ],
    },
  }),
}));

describe("InvestmentsPage", () => {
  it("lists savings groups as portfolio holdings", async () => {
    mocks.apiCall.mockResolvedValue([{
      id: "group-1",
      name: "SL Savings",
      currentBalance: 5_000,
      contributedMinor: 4_500,
    }]);
    render(<InvestmentsPage />);

    expect(await screen.findByText("SL Savings")).toBeInTheDocument();
    expect(screen.getByText("ZMW 200.00")).toBeInTheDocument();
    expect(screen.getByText("ZMW 175.00")).toBeInTheDocument();
    expect(screen.getByText("+ZMW 25.00")).toBeInTheDocument();
    expect(screen.getByText("Holdings", { selector: ".metricCardLabel" }).parentElement).toHaveTextContent("3");
    expect(screen.getByRole("heading", { name: "Your investments" })).toBeInTheDocument();
    expect(screen.getByText("Zanaco")).toBeInTheDocument();
    expect(screen.getByText("GRZ Bond")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your share-out groups" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add investment" })).toHaveLength(1);

    expect(screen.queryByText("Portfolio weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Your largest holding")).not.toBeInTheDocument();
    expect(screen.queryByText("Review next")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open history" })).not.toBeInTheDocument();
  });
});
