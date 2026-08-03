import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GoalsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-user-currency", () => ({ useUserCurrency: () => ({ currency: "ZMW" }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "token" }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("savings goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  async function openCreateDialog() {
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Create your first goal" }));
    return screen.getByRole("dialog", { name: "Create savings goal" });
  }

  it("starts a goal at the amount already saved", async () => {
    const dialog = await openCreateDialog();

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "Patumba pocket" } });
    fireEvent.change(screen.getByLabelText("Target (ZMW)"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Amount already saved (optional)"), { target: { value: "1200.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create goal" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/savings-groups", {
      method: "POST",
      body: {
        name: "Patumba pocket",
        targetMinor: 500_000,
        openingContributionMinor: 120_050,
        isShareoutGroup: false,
        cycleStart: expect.any(String),
        cycleLengthMonths: 12,
        currency: "ZMW",
      },
    }));
  });

  it("leaves the goal empty when nothing was saved yet", async () => {
    const dialog = await openCreateDialog();

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "School fees" } });
    fireEvent.change(screen.getByLabelText("Target (ZMW)"), { target: { value: "5000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create goal" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/savings-groups",
      expect.objectContaining({ body: expect.objectContaining({ openingContributionMinor: 0 }) }),
    ));
  });
});
