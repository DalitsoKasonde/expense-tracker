import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminNavigation } from "./admin-navigation";

describe("AdminNavigation", () => {
  it("links every administrative workspace on desktop and mobile", () => {
    render(<AdminNavigation />);
    const navigations = screen.getAllByRole("navigation", { name: "System administration navigation" });
    expect(navigations).toHaveLength(2);
    for (const href of ["#overview", "#users", "#administrators", "#backups", "#audit"]) {
      expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === href)).toHaveLength(2);
    }
  });
});
