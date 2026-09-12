import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

const savedPreferences = {
  defaultCurrency: "ZMW",
  theme: "light",
  colorScheme: "default",
  notificationsEnabled: false,
  emailDigestFrequency: "off",
  emailMutedNotificationTypes: [] as string[],
};

const catalogue = {
  mailEnabled: true,
  frequencies: ["off", "daily", "weekly", "monthly"],
  types: [
    { type: "spending-high", label: "Spending is running high", description: "Living expenses passed 70%." },
    { type: "loan-balance", label: "Outstanding loan balance", description: "What you still owe." },
  ],
};

describe("PreferencesSettingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.apiCall.mockReset();
    // Dispatching on path rather than call order keeps the test honest as the
    // page gains sections that load data of their own.
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
      if (path === "/v1/notifications/types") return Promise.resolve(catalogue);
      if (path === "/v1/user/emails") return Promise.resolve([]);
      if (path === "/v1/user/preferences") {
        return Promise.resolve(
          options?.method === "PATCH" ? { ...savedPreferences, ...(options.body as object) } : savedPreferences
        );
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderPage() {
    render(<PreferencesSettingsPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("automatically saves preference changes after the debounce", async () => {
    await renderPage();
    expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Default currency"), { target: { value: "USD" } });
    expect(screen.getByText("Saving preferences...")).toBeInTheDocument();

    const callsBeforeDebounce = mocks.apiCall.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(mocks.apiCall).toHaveBeenCalledTimes(callsBeforeDebounce);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.getByText("Preferences saved.")).toBeInTheDocument();
    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { ...savedPreferences, defaultCurrency: "USD" },
    });
  });

  it("lets the user switch to the sonto color scheme", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Color scheme"), { target: { value: "sonto" } });
    expect(screen.getByText("Saving preferences...")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { ...savedPreferences, colorScheme: "sonto" },
    });
  });

  it("saves the chosen email summary schedule", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email me a summary"), { target: { value: "weekly" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: { ...savedPreferences, emailDigestFrequency: "weekly" },
    });
  });

  // The alert checkboxes only make sense once something is scheduled, so they
  // stay hidden while summaries are off.
  it("only offers the per-alert choices once summaries are scheduled", async () => {
    await renderPage();

    expect(screen.queryByLabelText(/Spending is running high/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email me a summary"), { target: { value: "weekly" } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText(/Spending is running high/)).toBeInTheDocument();
  });

  // A ticked box means "send me this", so unticking one has to be stored as a
  // mute — the inverse of what the checkbox shows.
  it("stores an unticked alert as a mute", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email me a summary"), { target: { value: "weekly" } });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText(/Outstanding loan balance/));

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.apiCall).toHaveBeenLastCalledWith("/v1/user/preferences", {
      method: "PATCH",
      body: {
        ...savedPreferences,
        emailDigestFrequency: "weekly",
        emailMutedNotificationTypes: ["loan-balance"],
      },
    });
  });
});
