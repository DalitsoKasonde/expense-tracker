import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAdministratorsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

describe("AdminAdministratorsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockResolvedValue({ id: "admin-2", role: "system_admin" });
  });

  it("lets an administrator create another administrator", async () => {
    render(<AdminAdministratorsPage />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Operations Two" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ops2@example.com" } });
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "SafePassword2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Create administrator" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/admin/system-admins", {
        method: "POST",
        body: { email: "ops2@example.com", displayName: "Operations Two", password: "SafePassword2026" },
      })
    );
    expect(await screen.findByText(/System administrator created/)).toBeInTheDocument();
  });
});
