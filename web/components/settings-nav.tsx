"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: Route; label: string }> = [
  { href: "/settings/preferences", label: "Preferences" },
  { href: "/settings/accounts", label: "Accounts" },
  { href: "/settings/savings-groups" as Route, label: "Savings" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/income-sources", label: "Income" },
  { href: "/settings/businesses", label: "Business" },
  { href: "/settings/imports" as Route, label: "Import" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <div className="rounded-lg border border-outline bg-surface p-1.5 shadow-sm">
      <nav className="flex gap-1.5 overflow-x-auto" aria-label="Settings sections">
        {items.map((item) => {
          const isActive =
            currentPath === item.href || currentPath.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? "bg-primary-softer text-primary" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
