import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
  getApiBaseUrl: () => "http://localhost:8080",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "token" }, status: "authenticated" }),
}));

vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "USD", loading: false }),
}));

const year = new Date().getFullYear();

function month(index: number, overrides: Record<string, number> = {}) {
  return {
    month: index,
    monthLabel: `M${index}`,
    earnedIncome: 100_000,
    borrowedIncome: 0,
    totalInflow: 100_000,
    livingExpenses: 40_000,
    debtPrincipalPaid: 0,
    debtInterestFees: 0,
    savings: 10_000,
    investments: 0,
    operatingBalance: 50_000,
    freeCashFlow: 50_000,
    amountBroughtForward: 0,
    endingCashBalance: 50_000 * index,
    netWorth: 60_000 * index,
    ...overrides,
  };
}

function annualPayload() {
  const data = Array.from({ length: 12 }, (_, index) => month(index + 1));
  return {
    year,
    latestDataYear: year,
    availableYears: [year],
    rows: [],
    data,
    ytd: month(12),
  };
}

type CategoryFixture = {
  id: string;
  parentId: string | null;
  name: string;
  total: number;
  direct: number;
  months: number[];
  children: CategoryFixture[];
};

function categoryNode(
  id: string,
  name: string,
  total: number,
  children: CategoryFixture[] = [],
): CategoryFixture {
  const months = Array.from({ length: 12 }, (_, index) => (index === 1 ? total : 0));
  return { id, parentId: null, name, total, direct: total, months, children };
}

const categoryPayload = {
  year,
  currency: "USD",
  total: 150_000,
  months: Array.from({ length: 12 }, (_, index) => (index === 1 ? 150_000 : 0)),
  categories: [
    categoryNode("housing", "Housing", 100_000, [categoryNode("rent", "Rent", 100_000)]),
    categoryNode("food", "Food", 50_000),
  ],
};

async function renderReports() {
  render(<ReportsPage />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ReportsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path.startsWith("/v1/dashboard/annual")) return Promise.resolve(annualPayload());
      if (path.startsWith("/v1/dashboard/insights")) {
        return Promise.resolve({ debtRemaining: 0, alerts: [] });
      }
      if (path.startsWith("/v1/dashboard/categories")) return Promise.resolve(categoryPayload);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("scopes report data to the user's currency", async () => {
    await renderReports();

    // Without the currency parameter the API aggregates ZMW rows, which the page
    // would then label as USD.
    expect(mocks.apiCall).toHaveBeenCalledWith(
      `/v1/dashboard/annual?year=${year}&currency=USD`,
    );
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/dashboard/insights?currency=USD");
  });

  it("loads each report exactly once", async () => {
    await renderReports();

    const annualCalls = mocks.apiCall.mock.calls.filter((call) =>
      String(call[0]).startsWith("/v1/dashboard/annual"),
    );
    expect(annualCalls).toHaveLength(1);
  });

  it("charts only months that have already happened in the current year", async () => {
    await renderReports();

    const throughMonth = new Date().getMonth() + 1;
    // The matrix keeps all twelve columns, so only count labels outside table
    // headers: those come from the bar chart and the trend chart axis.
    const chartLabelsFor = (label: string) =>
      screen.queryAllByText(label).filter((element) => !element.closest("th"));

    expect(chartLabelsFor(`M${throughMonth}`)).toHaveLength(2);
    if (throughMonth < 12) {
      expect(chartLabelsFor("M12")).toHaveLength(0);
    }
  });

  it("still renders every month in the annual matrix", async () => {
    await renderReports();

    expect(screen.getByRole("columnheader", { name: "M12" })).toBeInTheDocument();
  });

  it("requests the category breakdown for the same year and currency", async () => {
    await renderReports();

    expect(mocks.apiCall).toHaveBeenCalledWith(
      `/v1/dashboard/categories?year=${year}&currency=USD`,
    );
  });

  it("ranks spending categories with their share of the total", async () => {
    await renderReports();

    expect(screen.getByText("Housing")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    // 100_000 of 150_000.
    expect(screen.getByText("66.7%")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
  });

  it("hides subcategories until the parent is expanded", async () => {
    await renderReports();

    expect(screen.queryByText("Rent")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Housing/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the rest of the report when only the category breakdown fails", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path.startsWith("/v1/dashboard/annual")) return Promise.resolve(annualPayload());
      if (path.startsWith("/v1/dashboard/insights")) {
        return Promise.resolve({ debtRemaining: 0, alerts: [] });
      }
      return Promise.reject(new Error("categories exploded"));
    });

    await renderReports();

    expect(screen.getByRole("alert")).toHaveTextContent("categories exploded");
    // The annual matrix is untouched by a category failure.
    expect(screen.getByRole("columnheader", { name: "M12" })).toBeInTheDocument();
  });
});
