import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddEntryDialog } from "./add-entry-dialog";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "test-token" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));
vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "ZMW", loading: false }),
}));
vi.mock("@/lib/offline-db", () => ({
  queuePendingTransaction: vi.fn(),
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

describe("AddEntryDialog", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([{ id: "account-1", name: "Mobile Money", accountClass: "asset", currency: "ZMW" }]);
      return Promise.resolve([]);
    });
  });

  it("asks what happened before showing transaction details", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "What happened?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I spent money" }));
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid from")).toBeInTheDocument();
    expect(screen.queryByText("Destination")).not.toBeInTheDocument();
  });

  it("creates stocks and government bonds without leaving quick add", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I bought an investment" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I bought an investment" }));

    expect(screen.getByRole("button", { name: "New stock" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Government bond" }));
    expect(screen.getByLabelText("Bond name")).toBeInTheDocument();
    expect(screen.getByLabelText("Annual coupon rate (%)")).toBeInTheDocument();
    expect(screen.queryByText("Create an asset first")).not.toBeInTheDocument();
  });

  it("calculates stock purchase cost from shares, price, and broker fees", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I bought an investment" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I bought an investment" }));

    fireEvent.change(screen.getByLabelText("Shares purchased"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Price per share"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Broker fees"), { target: { value: "10" } });

    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Calculated stock purchase total")).toHaveTextContent(/2,510\.00/);
  });

  it("moves money between active same-currency asset accounts", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "account-1", name: "Mobile Money", accountClass: "asset", currency: "ZMW" },
          { id: "account-2", name: "Bank account", accountClass: "asset", currency: "ZMW" },
          { id: "account-3", name: "Dollar account", accountClass: "asset", currency: "USD" },
          { id: "account-4", name: "Credit card", accountClass: "liability", currency: "ZMW" },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<AddEntryDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "I transferred money" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "I transferred money" }));

    expect(screen.getByLabelText("From account")).toHaveValue("account-1");
    const destination = screen.getByLabelText("To account");
    expect(destination).toHaveValue("account-2");
    expect(destination).toHaveTextContent("Bank account");
    expect(destination).not.toHaveTextContent("Dollar account");
    expect(destination).not.toHaveTextContent("Credit card");
  });
});
