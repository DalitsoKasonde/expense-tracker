import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

const member = {
  id: "user-1",
  maskedEmail: "d***@example.com",
  role: "member",
  isActive: true,
  createdAt: "2026-08-01T10:00:00Z",
  lastLoginAt: null,
  plan: "free",
  planExpiresAt: null,
  planSource: "signup",
};

describe("AdminUsersPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith("/v1/admin/users?email=")) return Promise.resolve([member]);
      if (path === "/v1/admin/users") return Promise.resolve([member]);
      if (path.startsWith("/v1/admin/users/user-1/") && options?.method === "PATCH") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected API call: ${path}`));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows only a masked address and never asks for financial records", async () => {
    render(<AdminUsersPage />);

    expect(await screen.findByText("d***@example.com")).toBeInTheDocument();
    expect(screen.queryByText("dalitso@example.com")).not.toBeInTheDocument();
    expect(mocks.apiCall).not.toHaveBeenCalledWith(expect.stringMatching(/accounts|transactions|loans|investments/));
  });

  it("looks an account up by the full address, since masked ones are indistinguishable", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("d***@example.com");

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "Dalitso@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/admin/users?email=dalitso%40example.com")
    );
  });

  it("grants a plan that never expires, which is how an account is made free forever", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("d***@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Premium, no expiry" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/admin/users/user-1/plan", {
        method: "PATCH",
        body: { plan: "premium", neverExpires: true },
      })
    );
  });

  it("confirms before suspending, because it signs the person out immediately", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("d***@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/admin/users/user-1/status", {
        method: "PATCH",
        body: { isActive: false },
      })
    );
    expect(await screen.findByText("Account suspended.")).toBeInTheDocument();
  });

  it("does not offer a downgrade for an account already on free", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("d***@example.com");

    expect(screen.queryByRole("button", { name: "Move to free" })).not.toBeInTheDocument();
  });
});
