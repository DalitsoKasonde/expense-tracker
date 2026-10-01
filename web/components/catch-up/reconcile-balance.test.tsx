import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconcileBalance } from "./reconcile-balance";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

const accounts = [{ id: "airtel", name: "Airtel Money", currency: "ZMW" }];

describe("ReconcileBalance", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path.startsWith("/v1/dashboard/unified")) {
        return Promise.resolve({ accountBalances: [{ accountId: "airtel", balanceMinor: 50000, currency: "ZMW" }] });
      }
      return Promise.resolve({ id: "saved" });
    });
  });

  it("reads the tracked balance for the account's own currency", async () => {
    render(<ReconcileBalance accounts={accounts} unsavedCount={0} />);
    expect(await screen.findByText(/in Airtel Money today/)).toBeInTheDocument();
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/dashboard/unified?currency=ZMW");
  });

  it("records a shortfall as one unaccounted expense", async () => {
    render(<ReconcileBalance accounts={accounts} unsavedCount={0} />);
    await screen.findByText(/in Airtel Money today/);
    fireEvent.change(screen.getByLabelText("Actual balance now (ZMW)"), { target: { value: "420.50" } });
    expect(screen.getByText(/left the account without being recorded/)).toHaveTextContent("79.50");

    fireEvent.click(screen.getByRole("button", { name: "Record as unaccounted spending" }));
    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
        method: "POST",
        body: expect.objectContaining({ entryKind: "expense_living", amount: 7950, accountId: "airtel", currency: "ZMW" }),
      }),
    );
  });

  it("never books a surplus", async () => {
    render(<ReconcileBalance accounts={accounts} unsavedCount={0} />);
    await screen.findByText(/in Airtel Money today/);
    fireEvent.change(screen.getByLabelText("Actual balance now (ZMW)"), { target: { value: "600" } });

    expect(screen.getByText(/more than the app expects/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record as unaccounted spending" })).not.toBeInTheDocument();
  });

  it("waits for unsaved sheet rows, which the balance does not include yet", async () => {
    render(<ReconcileBalance accounts={accounts} unsavedCount={3} />);
    await screen.findByText(/in Airtel Money today/);
    fireEvent.change(screen.getByLabelText("Actual balance now (ZMW)"), { target: { value: "100" } });

    expect(screen.getByText(/Save the 3 entries on the sheet first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record as unaccounted spending" })).toBeDisabled();
  });
});
