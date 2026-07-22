import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  primeCurrency: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "test-token" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-user-currency", () => ({ primeUserCurrency: mocks.primeCurrency }));

describe("guided onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([]);
      if (path === "/v1/user/preferences") return Promise.resolve({ defaultCurrency: "ZMW", theme: "light", notificationsEnabled: false });
      return Promise.resolve({});
    });
  });

  it("saves the chosen currency, account, and opening balance through real endpoints", async () => {
    render(<OnboardingPage />);
    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith("/v1/accounts"));

    fireEvent.click(screen.getByRole("button", { name: "USD" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Main bank" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Main bank opening balance"), { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Stocks" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Your workspace is ready" })).toBeInTheDocument());
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/user/preferences", expect.objectContaining({
      method: "PATCH",
      body: expect.objectContaining({ defaultCurrency: "USD" }),
    }));
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/accounts", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ name: "Main bank", currency: "USD", openingBalanceMinor: 12550 }),
    }));
    expect(screen.getByRole("link", { name: /Add your first stock/ })).toHaveAttribute("href", "/investments/add");
  });
});
