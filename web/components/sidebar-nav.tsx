"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AddEntryButton } from "@/components/add-entry-button";
import { signOutEverywhere } from "@/lib/browser-auth";
import { isNavigationItemActive, primaryNavigation } from "./app-navigation";

export function SidebarNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { data: session } = useSession();

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-outline bg-surface px-5 py-7 lg:flex" aria-label="Primary navigation">
      <div className="flex items-center gap-3 border-b border-outline px-2 pb-7">
        <span className="font-display text-2xl font-bold tracking-tight text-primary">Chuma</span>
      </div>

      <nav className="mt-7 grid gap-2">
        {primaryNavigation.map((item) => {
          const isActive = isNavigationItemActive(currentPath, item);
          const Icon = item.icon;
          const navClassName = `relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? "bg-primary-softer text-primary before:absolute before:left-0 before:h-6 before:w-1 before:rounded-r before:bg-accent" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`;
          const iconClassName = `grid size-8 place-items-center rounded-md ${isActive ? "bg-primary-soft" : "bg-surface-soft"}`;

          if (item.action === "add") {
            return (
              <AddEntryButton key={item.href} className={navClassName}>
                <span className={iconClassName} aria-hidden="true">
                  <Icon />
                </span>
                <span>{item.label}</span>
              </AddEntryButton>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={navClassName}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={iconClassName} aria-hidden="true">
                <Icon />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {session?.user && (
        <div className="mt-auto grid gap-3 border-t border-outline px-2 pt-5">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-sm font-bold text-on-surface">
              {session.user.name || "User"}
            </span>
            <span className="truncate text-xs text-on-surface-soft">{session.user.email}</span>
          </div>
          <button
            type="button"
            className="min-h-11 justify-self-start rounded-md px-2 text-sm font-semibold text-on-surface-soft hover:bg-surface-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => {
              void signOutEverywhere();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
