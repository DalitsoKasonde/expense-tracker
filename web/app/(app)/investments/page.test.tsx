import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InvestmentsPage from "./page";

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
  it("keeps the portfolio summary focused and avoids repeated analysis panels", () => {
    render(<InvestmentsPage />);

    expect(screen.getByText("ZMW 150.00")).toBeInTheDocument();
    expect(screen.getByText("ZMW 130.00")).toBeInTheDocument();
    expect(screen.getByText("+ZMW 20.00")).toBeInTheDocument();
    expect(screen.getByText("Holdings", { selector: ".metricCardLabel" }).parentElement).toHaveTextContent("2");
    expect(screen.getByRole("heading", { name: "Your investments" })).toBeInTheDocument();
    expect(screen.getByText("Zanaco")).toBeInTheDocument();
    expect(screen.getByText("GRZ Bond")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add investment" })).toHaveLength(1);

    expect(screen.queryByText("Portfolio weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Your largest holding")).not.toBeInTheDocument();
    expect(screen.queryByText("Review next")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open history" })).not.toBeInTheDocument();
  });
});
