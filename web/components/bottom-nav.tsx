"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: Route; label: string }> = [
  { href: "/today", label: "Today" },
  { href: "/add", label: "Add" },
  { href: "/investments", label: "Investments" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottomNav" aria-label="Primary">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "bottomNavLink active" : "bottomNavLink"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
