import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { investingHabit, stockHighlights } from "@/lib/stock-insights";
import { InvestingHabitCard } from "./investing-habit-card";
import { StockHighlightsCard } from "./stock-highlights";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

const months = Array.from({ length: 12 }, (_, index) => ({
  month: new Date(Date.UTC(2025, 10 + index, 1)).toISOString().slice(0, 7),
  investedMinor: index === 10 ? 50000 : index === 11 ? 20000 : 0,
}));
const activity = { currency: "ZMW", months, monthsInARow: 2, averageHoldingDays: 150, firstPurchaseDate: "2026-04-10", totalContributedMinor: 249640 };

describe("InvestingHabitCard", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
  });

  it("shows the streak, this month and how long the money has been held", () => {
    render(<InvestingHabitCard habit={investingHabit(activity, "2026-10-01", null, "ZMW")} currency="ZMW" onTargetChanged={vi.fn()} />);
    expect(screen.getByText("Months in a row").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("5 months")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("September 2026");
  });

  it("saves a target without disturbing the other settings", async () => {
    const stored = { defaultCurrency: "ZMW", theme: "dark", colorScheme: "sonto", emailLoggingReminder: true, monthlyInvestingTargetMinor: null };
    mocks.apiCall.mockImplementation((_path: string, options?: { method?: string; body?: object }) =>
      Promise.resolve(options?.method === "PATCH" ? { ...stored, ...options.body } : stored),
    );
    const onTargetChanged = vi.fn();
    render(<InvestingHabitCard habit={investingHabit(activity, "2026-10-01", null, "ZMW")} currency="ZMW" onTargetChanged={onTargetChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Set a monthly target" }));
    fireEvent.change(screen.getByLabelText("Monthly target (ZMW)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save target" }));

    await waitFor(() => expect(onTargetChanged).toHaveBeenCalledWith(50000));
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { ...stored, monthlyInvestingTargetMinor: 50000 },
    });
  });

  it("says how far this month is from the target", () => {
    render(<InvestingHabitCard habit={investingHabit(activity, "2026-10-01", 50000, "ZMW")} currency="ZMW" onTargetChanged={vi.fn()} />);
    expect(screen.getByText(/to go of/)).toHaveTextContent("300.00");
  });
});

describe("StockHighlightsCard", () => {
  it("lists the best and weakest holdings, linked to their pages", () => {
    const highlights = stockHighlights(
      [
        { assetId: "a", name: "Alpha", symbol: "ALP", currency: "ZMW", quantity: 10, investedMinor: 10000, valueMinor: 12000 },
        { assetId: "b", name: "Beta", symbol: "BET", currency: "ZMW", quantity: 500, investedMinor: 10000, valueMinor: 8000 },
      ],
      [],
      "2026-10-01",
    );
    render(<StockHighlightsCard highlights={highlights} />);
    expect(screen.getByText("Best performer").nextSibling).toHaveTextContent("ALP +20.0%");
    expect(screen.getByText("Weakest").nextSibling).toHaveTextContent("BET -20.0%");
    // ALP is also the largest holding and has the fewest shares, so it is linked more than once.
    expect(screen.getAllByRole("link", { name: "ALP" })[0]).toHaveAttribute("href", "/investments/a");
  });

  it("renders nothing when there is nothing to compare", () => {
    const { container } = render(<StockHighlightsCard highlights={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
