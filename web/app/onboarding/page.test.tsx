import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-error";
import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  primeCurrency: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      accessToken: "test-token",
      user: { id: "user-1", email: "test@example.com", role: "member" },
    },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));
vi.mock("@/lib/use-user-currency", () => ({ primeUserCurrency: mocks.primeCurrency }));

describe("guided onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } satisfies Storage,
    });
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/onboarding/status") {
        return Promise.resolve({ completed: false, interests: [] });
      }
      if (path === "/v1/onboarding/complete") {
        return Promise.resolve({ completed: true, interests: ["stocks"], accountsCreated: 1 });
      }
      return Promise.resolve({});
    });
  });

  it("saves currency, one-tap accounts, and interests in one completion request", async () => {
    render(<OnboardingPage />);
    expect(await screen.findByRole("heading", { name: "Start with your everyday currency" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "USD" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Main bank" }));
    fireEvent.click(screen.getByText(/Edit account details or add a custom account/));
    fireEvent.change(screen.getByLabelText("Main bank opening balance"), { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Stocks" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Your workspace is ready" })).toBeInTheDocument());
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/onboarding/complete", {
      method: "POST",
      body: {
        defaultCurrency: "USD",
        accounts: [{
          name: "Main bank",
          accountType: "bank",
          openingBalanceMinor: 12550,
        }],
        interests: ["stocks"],
      },
    });
    expect(mocks.primeCurrency).toHaveBeenCalledWith("USD");
    expect(screen.getByRole("link", { name: "Add your first transaction" })).toHaveAttribute("href", "/add");
    expect(screen.getByRole("link", { name: "Add your first stock" })).toHaveAttribute("href", "/investments/add");
    expect(window.localStorage.getItem("chuma:onboarding:user-1")).toBeNull();
  });

  it("restores an unfinished draft for the signed-in user", async () => {
    window.localStorage.setItem("chuma:onboarding:user-1", JSON.stringify({
      version: 2,
      step: 2,
      currency: "EUR",
      accounts: [{
        localId: 10,
        name: "Savings",
        accountType: "savings",
        openingBalance: "",
      }],
      interests: ["bonds"],
    }));

    render(<OnboardingPage />);

    expect(await screen.findByRole("heading", { name: "Make Expenses useful from day one" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Savings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/EUR 0\.00/)).toBeInTheDocument();
  });

  it("allows account setup to be skipped", async () => {
    render(<OnboardingPage />);
    await screen.findByRole("heading", { name: "Start with your everyday currency" });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("None selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Your workspace is ready" })).toBeInTheDocument());
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/onboarding/complete", {
      method: "POST",
      body: {
        defaultCurrency: "ZMW",
        accounts: [],
        interests: [],
      },
    });
    expect(screen.getByRole("link", { name: "Add your first account" })).toHaveAttribute("href", "/settings/accounts");
  });

  it("redirects completed users without showing setup", async () => {
    mocks.apiCall.mockResolvedValue({ completed: true, interests: [] });

    render(<OnboardingPage />);

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/today"));
  });

  it("falls back to the accounts endpoint when an older API returns 404", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/onboarding/status") {
        return Promise.reject(new ApiRequestError("API request failed: 404", 404));
      }
      if (path === "/v1/accounts") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<OnboardingPage />);

    expect(await screen.findByRole("heading", { name: "Start with your everyday currency" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/accounts");
  });
});
