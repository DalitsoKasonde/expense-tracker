"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
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

export function SidebarNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { data: session } = useSession();

  return (
    <aside className="sidebarNav" aria-label="Desktop Primary">
      <div className="sidebarBrand">
        <div className="sidebarBrandMark" aria-hidden="true">
          I
        </div>
        <div className="sidebarTitleGroup">
          <span className="sidebarAppName">Inscribed</span>
          <span className="sidebarAppPulse">Engineered for Creativity</span>
        </div>
      </div>

      <nav className="sidebarMenu">
        {items.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== "/today" && currentPath.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? "sidebarNavLink active" : "sidebarNavLink"}
            >
              <span className="sidebarNavIcon" aria-hidden="true">
                <Icon />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {session?.user && (
        <div className="sidebarUser">
          <div className="sidebarUserDetails">
            <span className="sidebarUserName">
              {session.user.name || "User"}
            </span>
            <span className="sidebarUserEmail">{session.user.email}</span>
          </div>
          <button
            type="button"
            className="sidebarLogoutBtn"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
