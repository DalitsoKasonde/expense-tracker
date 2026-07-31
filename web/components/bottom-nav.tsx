"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddEntryButton } from "@/components/add-entry-button";
import { isNavigationItemActive, primaryNavigation } from "./app-navigation";

export function BottomNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <nav
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 grid grid-cols-5 rounded-lg border border-outline bg-surface/95 p-1.5 shadow-md backdrop-blur lg:hidden print:hidden"
      aria-label="Primary navigation"
    >
      {primaryNavigation.map((item) => {
        const isActive = isNavigationItemActive(currentPath, item);
        const Icon = item.icon;
          const navClassName = `relative grid min-h-14 min-w-11 place-items-center gap-0.5 rounded-md px-1 text-[10px] font-semibold ${item.action === "add" ? "-mt-5 bg-action text-action-contrast shadow-md hover:bg-action-hover" : isActive ? "bg-primary-softer text-primary" : "text-on-surface-soft hover:bg-surface-soft"}`;

        if (item.action === "add") {
          return (
            <AddEntryButton key={item.href} className={navClassName}>
              <span className="grid size-7 place-items-center" aria-hidden="true">
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
            <span className="grid size-7 place-items-center" aria-hidden="true">
              <Icon />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
