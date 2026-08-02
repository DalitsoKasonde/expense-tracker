"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: Route; label: string }> = [
  { href: "/settings/preferences", label: "Preferences" },
  { href: "/settings/accounts", label: "Accounts" },
  { href: "/settings/savings-groups" as Route, label: "Savings groups" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/income-sources", label: "Income" },
  { href: "/settings/businesses", label: "Business" },
  { href: "/settings/imports" as Route, label: "Import" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <div className="min-w-0 max-w-full rounded-lg border border-outline bg-surface p-1 shadow-sm">
      <div className="relative min-w-0 overflow-hidden">
        {/* The right padding leaves a visible next-tab edge on phones. */}
        <nav className="settingsTabScroller flex min-w-0 max-w-full gap-1.5 overflow-x-auto p-0.5 pr-12" aria-label="Settings sections">
          {items.map((item) => {
            const isActive =
              currentPath === item.href || currentPath.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap ${isActive ? "bg-primary-softer text-primary" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent sm:hidden" />
      </div>
      <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-on-surface-soft sm:hidden">
        Swipe sideways for more settings
      </p>
    </div>
  );
}
