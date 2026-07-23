import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("saves currency, accounts, balances, and interests in one completion request", async () => {
    render(<OnboardingPage />);
    expect(await screen.findByRole("heading", { name: "Start with your everyday currency" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "USD" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Main bank" }));
    fireEvent.change(screen.getByLabelText("Main bank opening balance"), { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Review setup" }));
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
      version: 1,
      step: 2,
      currency: "EUR",
      accounts: [{
        localId: 10,
        name: "Euro savings",
        accountType: "savings",
        openingBalance: "42.00",
      }],
      interests: ["bonds"],
    }));

    render(<OnboardingPage />);

    expect(await screen.findByRole("heading", { name: "Where is your money today?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Account name")).toHaveValue("Euro savings");
    expect(screen.getByLabelText("Euro savings opening balance")).toHaveValue("42.00");
    expect(screen.getByText("EUR")).toBeInTheDocument();
  });

  it("validates balances before showing the review", async () => {
    render(<OnboardingPage />);
    await screen.findByRole("heading", { name: "Start with your everyday currency" });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Cash" }));
    fireEvent.change(screen.getByLabelText("Cash opening balance"), { target: { value: "10.999" } });
    fireEvent.click(screen.getByRole("button", { name: "Review setup" }));

    expect(screen.getByRole("alert")).toHaveTextContent("no more than two decimal places");
    expect(screen.getByRole("heading", { name: "Where is your money today?" })).toBeInTheDocument();
  });

  it("redirects completed users without showing setup", async () => {
    mocks.apiCall.mockResolvedValue({ completed: true, interests: [] });

    render(<OnboardingPage />);

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/today"));
  });
});
