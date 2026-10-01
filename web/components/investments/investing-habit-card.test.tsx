import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { investingHabit } from "@/lib/investing-habit";
import { InvestingHabitCard } from "./investing-habit-card";

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

  it("shows the run, this month and how long the money has been held", () => {
    render(<InvestingHabitCard scope="stock" habit={investingHabit(activity, "2026-10-01", null, "ZMW")} currency="ZMW" onTargetsChanged={vi.fn()} />);
    expect(screen.getByText("Months in a row").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("5 months")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("September 2026");
  });

  it("leaves out the holding period where there is none, as for savings", () => {
    render(
      <InvestingHabitCard
        scope="savings_pocket"
        habit={investingHabit({ ...activity, averageHoldingDays: null }, "2026-10-01", null, "ZMW")}
        currency="ZMW"
        onTargetsChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your saving habit" })).toBeInTheDocument();
    expect(screen.queryByText("Held for")).not.toBeInTheDocument();
  });

  it("saves the target for its own scope", async () => {
    mocks.apiCall.mockResolvedValue({ targets: { stock: 30000, bond: 50000 } });
    const onTargetsChanged = vi.fn();
    render(<InvestingHabitCard scope="bond" habit={investingHabit(activity, "2026-10-01", null, "ZMW")} currency="ZMW" onTargetsChanged={onTargetsChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Set a monthly target" }));
    fireEvent.change(screen.getByLabelText("Monthly target (ZMW)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save target" }));

    await waitFor(() => expect(onTargetsChanged).toHaveBeenCalledWith({ stock: 30000, bond: 50000 }));
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/investments/targets/bond", { method: "PUT", body: { targetMinor: 50000 } });
  });

  it("says how far this month is from the target", () => {
    render(<InvestingHabitCard scope="all" habit={investingHabit(activity, "2026-10-01", 50000, "ZMW")} currency="ZMW" onTargetsChanged={vi.fn()} />);
    expect(screen.getByText(/to go of/)).toHaveTextContent("300.00");
  });
});
