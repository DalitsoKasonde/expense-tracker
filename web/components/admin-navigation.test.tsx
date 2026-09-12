import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminNavigation } from "./admin-navigation";

const mocks = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

describe("AdminNavigation", () => {
  it("links every administrative workspace on desktop and mobile", () => {
    render(<AdminNavigation />);
    const navigations = screen.getAllByRole("navigation", { name: "System administration navigation" });
    expect(navigations).toHaveLength(2);
    for (const href of ["/admin", "/admin/users", "/admin/invitations", "/admin/feedback", "/admin/backups", "/admin/administrators", "/admin/audit"]) {
      expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === href)).toHaveLength(2);
    }
  });

  it("marks the page you are on, and only that page", () => {
    mocks.pathname = "/admin/users";
    render(<AdminNavigation />);

    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("href")).toBe("/admin/users");
  });

  it("does not leave Overview highlighted on every other page", () => {
    mocks.pathname = "/admin/backups";
    render(<AdminNavigation />);

    const overview = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/admin");
    for (const link of overview) expect(link.getAttribute("aria-current")).toBeNull();
  });
});
