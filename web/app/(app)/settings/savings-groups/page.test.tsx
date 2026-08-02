import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavingsGroupsSettingsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-user-currency", () => ({ useUserCurrency: () => ({ currency: "ZMW" }) }));

describe("savings group settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  it("creates every savings group as a share-out group without an unused target", async () => {
    render(<SavingsGroupsSettingsPage />);
    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/savings-groups"));

    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(screen.queryByLabelText("Target")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Share-out group")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "SL Savings" } });
    fireEvent.change(screen.getByLabelText("Amount already contributed (optional)"), { target: { value: "250" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Create group" })).getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/savings-groups", {
      method: "POST",
      body: {
        name: "SL Savings",
        cycleStart: expect.any(String),
        cycleLengthMonths: 12,
        openingContributionMinor: 25_000,
        isShareoutGroup: true,
        currency: "ZMW",
      },
    }));
  });
});
