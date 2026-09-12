import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ useApiCall: () => mocks.apiCall }));

const member = {
  id: "user-1",
  maskedEmail: "d***@example.com",
  role: "member",
  isActive: false,
  createdAt: "2026-08-01T10:00:00Z",
  lastLoginAt: null,
  plan: "free",
  planExpiresAt: null,
  planSource: "signup",
};

function respondWith(overrides: Record<string, unknown[]> = {}) {
  mocks.apiCall.mockImplementation((path: string) => {
    if (path === "/v1/admin/users") return Promise.resolve(overrides.users ?? [member]);
    if (path === "/v1/admin/backups") return Promise.resolve(overrides.backups ?? []);
    if (path === "/v1/admin/feedback") return Promise.resolve(overrides.feedback ?? []);
    if (path === "/v1/admin/invitations") return Promise.resolve(overrides.invitations ?? []);
    return Promise.reject(new Error(`unexpected API call: ${path}`));
  });
}

describe("AdminPage overview", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    respondWith();
  });

  it("names what is waiting instead of leaving it to be found section by section", async () => {
    respondWith({
      feedback: [{ id: "f1", maskedEmail: "d***@example.com", message: "hi", status: "new", createdAt: "2026-09-01T10:00:00Z" }],
      invitations: [{ id: "i1", email: "a@example.com", premiumMonths: 6, expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }],
    });

    render(<AdminPage />);

    expect(await screen.findByText("1 note has not been read yet.")).toBeInTheDocument();
    expect(screen.getByText("1 invitation is still waiting to be accepted.")).toBeInTheDocument();
    expect(screen.getByText("1 account is suspended and cannot sign in.")).toBeInTheDocument();
    expect(screen.getByText("No database backup has ever been taken.")).toBeInTheDocument();
  });

  it("links every workspace, so none can be reachable only by guessing the URL", async () => {
    render(<AdminPage />);
    await screen.findByText("Where things are");

    for (const href of ["/admin/users", "/admin/invitations", "/admin/feedback", "/admin/backups", "/admin/administrators", "/admin/audit"]) {
      expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === href)).toBe(true);
    }
  });

  it("says so plainly when nothing is outstanding", async () => {
    respondWith({
      users: [{ ...member, isActive: true }],
      backups: [{ id: "b1", status: "completed", requestedAt: "2026-09-10T02:00:00Z" }],
    });

    render(<AdminPage />);

    expect(await screen.findByText(/Nothing is waiting/)).toBeInTheDocument();
  });
});
