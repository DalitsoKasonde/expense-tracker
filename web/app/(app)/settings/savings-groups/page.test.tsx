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

  function group(overrides: Record<string, unknown> = {}) {
    return {
      id: "group-1",
      accountId: "account-1",
      name: "SL Savings",
      isShareoutGroup: true,
      cycleStart: "2026-01-01",
      cycleLengthMonths: 12,
      status: "active",
      contributedMinor: 0,
      loanRepaymentsMinor: 0,
      pendingLoanMinor: 0,
      currentBalance: 0,
      ...overrides,
    };
  }

  it("deletes a group that has no savings recorded", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([group()]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<SavingsGroupsSettingsPage />);
    await screen.findByRole("button", { name: "Delete" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/savings-groups/group-1", { method: "DELETE" }));
    expect(await screen.findByText("Savings group deleted.")).toBeInTheDocument();
  });

  it("blocks deletion once the group holds savings", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([group({ contributedMinor: 25_000, currentBalance: 25_000 })]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<SavingsGroupsSettingsPage />);
    await screen.findByRole("button", { name: "Delete" });

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("edits the current cycle start date", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([group()]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<SavingsGroupsSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit start date" }));

    const dialog = screen.getByRole("dialog", { name: "Edit SL Savings" });
    const startDate = within(dialog).getByLabelText("Cycle start");
    expect(startDate).toHaveValue("2026-01-01");
    fireEvent.change(startDate, { target: { value: "2026-02-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save start date" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/savings-groups/group-1", {
      method: "PATCH",
      body: { cycleStart: "2026-02-01" },
    }));
    expect(await screen.findByText("Savings group start date updated.")).toBeInTheDocument();
  });

  it("keeps non-share-out groups visible and editable", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/savings-groups") return Promise.resolve([group({ isShareoutGroup: false })]);
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<SavingsGroupsSettingsPage />);

    expect(await screen.findByText("SL Savings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit start date" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Record share-out" })).toBeDisabled();
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
