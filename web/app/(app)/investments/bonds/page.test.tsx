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

const summary = {
  currency: "ZMW",
  holdingCount: 1,
  principalMinor: 200_000,
  couponGrossReceivedMinor: 20_000,
  couponTaxWithheldMinor: 3_000,
  couponNetReceivedMinor: 17_000,
  couponsReceivedCount: 2,
  reinvestedMinor: 0,
  paidToCashMinor: 17_000,
  principalRedeemedMinor: 0,
  couponNetOutstandingMinor: 51_000,
  nextCouponDate: "2027-03-08",
  nextCouponNetMinor: 8_500,
};

describe("BondsDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/bonds") {
        return Promise.resolve([{ assetId: "bond-1", issueDate: "2026-03-08", maturityDate: "2029-03-08" }]);
      }
      if (path === "/v1/bonds/summary") {
        return Promise.resolve([summary]);
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

  it("reports coupon income received as the gain, not the change in carrying value", async () => {
    render(<BondsDashboardPage />);

    expect(await screen.findByText("Coupon income received")).toBeInTheDocument();
    // Value less principal is structurally zero for a bond, so a +0.00 gain
    // would be the meaningless figure this replaced.
    expect(screen.getByText(/\+ZMW\s?170\.00/)).toBeInTheDocument();
    expect(screen.getByText(/2 payments/)).toBeInTheDocument();
    expect(screen.getByText(/8\.5% of principal/)).toBeInTheDocument();
  });

  it("shows the withholding tax that produced the net figure", async () => {
    render(<BondsDashboardPage />);

    expect(await screen.findByText(/ZMW\s?200\.00 gross, less ZMW\s?30\.00 withholding tax/)).toBeInTheDocument();
  });

  it("keeps scheduled coupons out of the gain and labels them as still to come", async () => {
    render(<BondsDashboardPage />);

    const outstanding = await screen.findByText(/Still scheduled/);
    expect(outstanding).toHaveTextContent(/ZMW\s?510\.00/);
    expect(outstanding).toHaveTextContent(/next ZMW\s?85\.00/);
    // The projected total must never be presented as income received.
    expect(screen.queryByText(/\+ZMW\s?510\.00/)).not.toBeInTheDocument();
  });

  it("separates no coupons yet from an unavailable figure", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/bonds") {
        return Promise.resolve([{ assetId: "bond-1", issueDate: "2026-03-08", maturityDate: "2029-03-08" }]);
      }
      if (path === "/v1/bonds/summary") {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve([]);
    });
    render(<BondsDashboardPage />);

    // Reporting a confident zero here would misstate income.
    expect(await screen.findByText(/couldn't load coupon income/i)).toBeInTheDocument();
    expect(screen.queryByText(/No coupons paid yet/)).not.toBeInTheDocument();
  });

  it("reports no coupons yet when none have been paid", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/bonds") {
        return Promise.resolve([{ assetId: "bond-1", issueDate: "2026-03-08", maturityDate: "2029-03-08" }]);
      }
      if (path === "/v1/bonds/summary") {
        return Promise.resolve([{
          ...summary,
          couponGrossReceivedMinor: 0,
          couponTaxWithheldMinor: 0,
          couponNetReceivedMinor: 0,
          couponsReceivedCount: 0,
          paidToCashMinor: 0,
        }]);
      }
      return Promise.resolve([]);
    });
    render(<BondsDashboardPage />);

    expect(await screen.findByText(/No coupons paid yet/)).toBeInTheDocument();
  });
});
