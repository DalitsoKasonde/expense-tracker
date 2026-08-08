import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

describe("AdminPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/admin/users") {
        return Promise.resolve([{
          id: "user-1",
          maskedEmail: "d***@example.com",
          role: "member",
          isActive: true,
          createdAt: "2026-08-01T10:00:00Z",
          lastLoginAt: null,
        }]);
      }
      if (path === "/v1/admin/backups") return Promise.resolve([]);
      if (path === "/v1/admin/audit") return Promise.resolve([]);
      if (path === "/v1/admin/feedback") return Promise.resolve([]);
      if (path === "/v1/admin/users/user-1/status" && options?.method === "PATCH") return Promise.resolve(undefined);
      if (path === "/v1/admin/system-admins" && options?.method === "POST") return Promise.resolve({ id: "admin-2", role: "system_admin" });
      return Promise.reject(new Error(`unexpected API call: ${path}`));
    });
  });

  it("shows only masked operational user data and can suspend access", async () => {
    render(<AdminPage />);

    expect(await screen.findByText("d***@example.com")).toBeInTheDocument();
    expect(screen.queryByText("dalitso@example.com")).not.toBeInTheDocument();
    expect(mocks.apiCall).not.toHaveBeenCalledWith(expect.stringMatching(/accounts|transactions|loans|investments/));

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/admin/users/user-1/status",
      { method: "PATCH", body: { isActive: false } },
    ));
    expect(await screen.findByText("User suspended.")).toBeInTheDocument();
  });

  it("lets the bootstrap administrator create another administrator", async () => {
    render(<AdminPage />);
    await screen.findByText("d***@example.com");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Operations Two" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ops2@example.com" } });
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "SafePassword2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Create administrator" }));

    await waitFor(() => expect(mocks.apiCall).toHaveBeenCalledWith(
      "/v1/admin/system-admins",
      {
        method: "POST",
        body: { email: "ops2@example.com", displayName: "Operations Two", password: "SafePassword2026" },
      },
    ));
    expect(await screen.findByText("System administrator created.")).toBeInTheDocument();
  });
});
