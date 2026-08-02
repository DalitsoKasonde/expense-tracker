import { describe, expect, it } from "vitest";
import {
  isNavigationItemActive,
  moreNavigation,
  primaryNavigation,
  sidebarNavigation,
} from "./app-navigation";

const more = sidebarNavigation.find((item) => String(item.href) === "/more")!;
const reports = sidebarNavigation.find((item) => String(item.href) === "/reports")!;

describe("navigation structure", () => {
  it("keeps the bottom bar to five slots", () => {
    expect(primaryNavigation).toHaveLength(5);
  });

  it("promotes reports, goals, and loans in the sidebar", () => {
    const hrefs = sidebarNavigation.map((item) => String(item.href));
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/goals");
    expect(hrefs).toContain("/loans");
  });

  it("keeps every destination reachable from the phone's More page", () => {
    const bottomBar = primaryNavigation.map((item) => String(item.href));
    for (const item of sidebarNavigation) {
      const href = String(item.href);
      if (href === "/more" || bottomBar.includes(href)) continue;
      expect(moreNavigation.map(({ href: moreHref }) => String(moreHref))).toContain(href);
    }
  });
});

describe("isNavigationItemActive", () => {
  it("marks a promoted destination active without also lighting up More", () => {
    expect(isNavigationItemActive("/reports", reports)).toBe(true);
    expect(isNavigationItemActive("/reports", more)).toBe(false);
  });

  it("still treats settings as living under More", () => {
    expect(isNavigationItemActive("/settings/accounts", more)).toBe(true);
  });
});
