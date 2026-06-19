"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  HistoryIcon,
  AddIcon,
  PortfolioIcon,
  SettingsIcon,
} from "./nav-icons";

const items: Array<{
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/today", label: "Overview", icon: DashboardIcon },
  { href: "/transactions", label: "History", icon: HistoryIcon },
  { href: "/add", label: "Add", icon: AddIcon },
  { href: "/investments", label: "Portfolio", icon: PortfolioIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <nav className="bottomNav" aria-label="Primary">
      {items.map((item) => {
        const isActive =
          currentPath === item.href ||
          (item.href !== "/today" && currentPath.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "bottomNavLink active" : "bottomNavLink"}
          >
            <span className="bottomNavGlyph" aria-hidden="true">
              <Icon />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
