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
});
