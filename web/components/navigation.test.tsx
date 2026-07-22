import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import MorePage from "@/app/(app)/more/page";

const mocks = vi.hoisted(() => ({
  path: "/transactions",
  signOut: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Chuma User", email: "user@example.com" } } }),
}));
vi.mock("@/lib/browser-auth", () => ({ signOutEverywhere: mocks.signOut }));
vi.mock("./add-entry-dialog", () => ({ AddEntryDialog: () => null }));

describe("Chuma navigation", () => {
  beforeEach(() => mocks.signOut.mockClear());

  it("marks the current mobile destination and exposes quick add", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/more");
  });

  it("renders desktop destinations and signs out safely", () => {
    render(<SidebarNav />);
    expect(screen.getByText("Chuma")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/investments");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/more");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps every secondary destination reachable from More", () => {
    render(<MorePage />);
    for (const destination of ["Loans", "Goals", "Reports", "Imports", "Settings"]) {
      expect(screen.getByRole("link", { name: new RegExp(destination) })).toBeInTheDocument();
    }
  });
});
