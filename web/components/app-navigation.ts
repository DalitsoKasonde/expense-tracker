import type { Route } from "next";
import type { ComponentType, SVGProps } from "react";
import {
  AddIcon,
  DashboardIcon,
  HistoryIcon,
  MoreIcon,
  PortfolioIcon,
} from "./nav-icons";

export type NavigationItem = {
  href: Route;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  action?: "add";
};

export const primaryNavigation: NavigationItem[] = [
  { href: "/today", label: "Home", icon: DashboardIcon },
  { href: "/transactions", label: "Activity", icon: HistoryIcon },
  { href: "/add", label: "Add", icon: AddIcon, action: "add" },
  { href: "/investments", label: "Portfolio", icon: PortfolioIcon },
  { href: "/more" as Route, label: "More", icon: MoreIcon },
];

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
    return pathname === "/more" || pathname.startsWith("/settings/") || moreNavigation.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  }
  return pathname === item.href || (item.href !== "/today" && pathname.startsWith(`${item.href}/`));
}
