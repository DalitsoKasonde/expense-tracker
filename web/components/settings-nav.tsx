"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: Route; label: string }> = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/preferences", label: "Preferences" },
  { href: "/settings/accounts", label: "Accounts" },
  { href: "/settings/loans" as Route, label: "Loans" },
  { href: "/settings/savings-groups" as Route, label: "Savings Groups" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/income-sources", label: "Income Sources" },
  { href: "/settings/businesses", label: "Businesses" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <div className="settingsNavFrame">
      <div className="settingsNavIntro">
        <span className="settingsNavLabel">Workspace</span>
        <span className="muted">Move between preferences, balances, categories, and income structure without losing your place.</span>
      </div>
      <nav className="settingsNav" aria-label="Settings sections">
        {items.map((item) => {
          const isActive =
            currentPath === item.href || (item.href !== "/settings" && currentPath.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "settingsNavLink active" : "settingsNavLink"}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
