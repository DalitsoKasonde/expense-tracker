import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BondsDashboardPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-unified-dashboard", () => ({
  useUnifiedDashboard: () => ({
    loading: false,
    data: {
      currency: "ZMW",
      assets: [{
        assetId: "bond-1",
        name: "ZM1000007659",
        symbol: "ZM1000007659",
        assetClass: "bond",
        currency: "ZMW",
        investedAmountMinor: 200_000,
        currentValueMinor: 200_000,
        hasPosition: true,
      }],
    },
  }),
}));

describe("BondsDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/bonds") {
        return Promise.resolve([{ assetId: "bond-1", issueDate: "2026-03-08", maturityDate: "2029-03-08" }]);
      }
      return Promise.resolve([]);
    });
  });

  it("shows when each bond was bought and when it matures", async () => {
    render(<BondsDashboardPage />);

    const purchased = new Date("2026-03-08T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
    const matures = new Date("2029-03-08T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
    expect(
      await screen.findByText(`ZM1000007659 · Bought ${purchased} · Matures ${matures}`),
    ).toBeInTheDocument();
  });

  it("still lists holdings when the bond dates cannot be loaded", async () => {
    mocks.apiCall.mockRejectedValue(new Error("offline"));
    render(<BondsDashboardPage />);

    expect(await screen.findByRole("link", { name: /ZM1000007659/ })).toBeInTheDocument();
    expect(screen.queryByText(/Bought/)).not.toBeInTheDocument();
  });
});
