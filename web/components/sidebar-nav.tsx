"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AddEntryButton } from "@/components/add-entry-button";
import { signOutEverywhere } from "@/lib/browser-auth";
import { Brand } from "@/components/brand";
import { addNavigationItem, isNavigationItemActive, sidebarNavigation } from "./app-navigation";

const AddActionIcon = addNavigationItem.icon;

export function SidebarNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { data: session } = useSession();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-outline bg-surface px-5 py-7 lg:flex print:hidden" aria-label="Primary navigation">
      <div className="border-b border-outline px-2 pb-6">
        <Brand compact priority />
      </div>

      {/* Adding an entry is the one thing here that is not a place to go, so it
          sits above the list as a filled action rather than a fourth link. */}
      <div className="mt-7 border-b border-outline pb-5">
        <AddEntryButton className="btn btn-primary w-full justify-center">
          <span className="mr-2 grid size-5 place-items-center" aria-hidden="true">
            <AddActionIcon />
          </span>
          {addNavigationItem.label}
        </AddEntryButton>
      </div>

      <nav className="mt-5 grid gap-2">
        {sidebarNavigation.map((item) => {
          const isActive = isNavigationItemActive(currentPath, item);
          const Icon = item.icon;
          const navClassName = `relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "bg-primary-softer text-primary before:absolute before:left-0 before:h-6 before:w-1 before:rounded-r before:bg-accent" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`;
          const iconClassName = `grid size-8 place-items-center rounded-md ${isActive ? "bg-primary-soft" : "bg-surface-soft"}`;

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
            className="min-h-11 justify-self-start rounded-md px-2 text-sm font-semibold text-on-surface-soft hover:bg-surface-soft hover:text-primary"
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
