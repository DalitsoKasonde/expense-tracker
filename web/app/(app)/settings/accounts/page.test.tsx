import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supportedCurrencies } from "@/lib/currencies";
import AccountsSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "ZMW", loading: false }),
}));

describe("AccountsSettingsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("offers every supported currency when creating an account", async () => {
    const user = userEvent.setup();
    render(<AccountsSettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Create account" }));

    const currency = screen.getByRole("combobox", { name: "Currency" });
    expect(currency).toHaveValue("ZMW");
    expect(Array.from(currency.querySelectorAll("option"), (option) => option.value)).toEqual(
      supportedCurrencies,
    );
    expect(currency).toBeEnabled();
  });

  describe("editing an account that already has transactions", () => {
    beforeEach(() => {
      mocks.apiCall.mockImplementation((path: string) => {
        if (path === "/v1/accounts") {
          return Promise.resolve([{
            id: "acc-1",
            name: "Airtel Money",
            accountType: "mobile_money",
            accountClass: "asset",
            currency: "ZMW",
            openingBalanceMinor: 50_000,
            hasTransactions: true,
          }]);
        }
        if (path.startsWith("/v1/dashboard/unified")) {
          return Promise.resolve({ accountBalances: [{ accountId: "acc-1", balanceMinor: 50_000 }] });
        }
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    });

    it("locks the currency and explains why", async () => {
      // Balances match transactions to their account on currency, so switching
      // it here would detach the history and silently zero the balance.
      const user = userEvent.setup();
      render(<AccountsSettingsPage />);

      await user.click(await screen.findByRole("button", { name: "Edit" }));

      expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
      expect(screen.getByText(/its currency is fixed/i)).toBeInTheDocument();
    });

    it("still allows renaming and retyping the account", async () => {
      const user = userEvent.setup();
      render(<AccountsSettingsPage />);

      await user.click(await screen.findByRole("button", { name: "Edit" }));

      expect(screen.getByLabelText("Name")).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "Account type" })).toBeEnabled();
    });
  });
});
