import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

describe("PreferencesSettingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.apiCall.mockReset();
    mocks.apiCall
      .mockResolvedValueOnce({ defaultCurrency: "ZMW", theme: "light", colorScheme: "default", notificationsEnabled: false })
      .mockResolvedValueOnce({ defaultCurrency: "USD", theme: "light", colorScheme: "default", notificationsEnabled: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("automatically saves preference changes after the debounce", async () => {
    render(<PreferencesSettingsPage />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Default currency"), { target: { value: "USD" } });
    expect(screen.getByText("Saving preferences...")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(mocks.apiCall).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.getByText("Preferences saved.")).toBeInTheDocument();
    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { defaultCurrency: "USD", theme: "light", colorScheme: "default", notificationsEnabled: false },
    });
  });

  it("lets the user switch to the sonto color scheme", async () => {
    render(<PreferencesSettingsPage />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText("Color scheme"), { target: { value: "sonto" } });
    expect(screen.getByText("Saving preferences...")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { defaultCurrency: "ZMW", theme: "light", colorScheme: "sonto", notificationsEnabled: false },
    });
  });
});
