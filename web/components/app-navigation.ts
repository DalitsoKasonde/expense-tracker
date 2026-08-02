import type { Route } from "next";
import type { ComponentType, SVGProps } from "react";
import {
  AddIcon,
  DashboardIcon,
  GoalsIcon,
  HistoryIcon,
  LoansIcon,
  MoreIcon,
  PortfolioIcon,
  ReportsIcon,
} from "./nav-icons";

export type NavigationItem = {
  href: Route;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  action?: "add";
};

/**
 * The mobile bottom bar. Five slots is the practical ceiling at phone widths,
 * so this stays a shortlist and "More" carries the rest.
 */
export const primaryNavigation: NavigationItem[] = [
  { href: "/today", label: "Home", icon: DashboardIcon },
  { href: "/transactions", label: "Activity", icon: HistoryIcon },
  { href: "/add", label: "Add", icon: AddIcon, action: "add" },
  { href: "/investments", label: "Portfolio", icon: PortfolioIcon },
  { href: "/more" as Route, label: "More", icon: MoreIcon },
];

/**
 * The desktop sidebar, which has the room the bottom bar does not. Goals,
 * Reports, and Loans are top-level here instead of being buried a click deep;
 * only Imports and Settings still live behind "More".
 *
 * "Add" is deliberately absent: it is an action, not a destination, and the
 * sidebar renders it separately so it stops reading as a fourth page link.
 */
export const sidebarNavigation: NavigationItem[] = [
  { href: "/today", label: "Home", icon: DashboardIcon },
  { href: "/transactions", label: "Activity", icon: HistoryIcon },
  { href: "/investments", label: "Portfolio", icon: PortfolioIcon },
  { href: "/reports", label: "Reports", icon: ReportsIcon },
  { href: "/goals" as Route, label: "Goals", icon: GoalsIcon },
  { href: "/loans" as Route, label: "Loans", icon: LoansIcon },
  { href: "/more" as Route, label: "More", icon: MoreIcon },
];

export const addNavigationItem: NavigationItem = {
  href: "/add",
  label: "Add entry",
  icon: AddIcon,
  action: "add",
};

export const moreNavigation: Array<{ href: Route; label: string; description: string }> = [
  { href: "/loans" as Route, label: "Loans", description: "Track borrowing and repayments" },
  { href: "/goals" as Route, label: "Goals", description: "Set personal savings targets and track progress" },
  { href: "/reports", label: "Reports", description: "Review annual and monthly movement" },
  { href: "/import", label: "Imports", description: "Bring in transactions from a spreadsheet" },
  { href: "/settings/preferences", label: "Settings", description: "Manage accounts, categories, currency, and preferences" },
];

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  if (item.action === "add") return pathname === item.href;
  if (String(item.href) === "/more") {
    const promoted = sidebarNavigation.some(({ href }) => String(href) !== "/more" && (pathname === href || pathname.startsWith(`${href}/`)));
    if (promoted) return false;
    return pathname === "/more" || pathname.startsWith("/settings/") || moreNavigation.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  }
  return pathname === item.href || (item.href !== "/today" && pathname.startsWith(`${item.href}/`));
}
