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
  });
});
