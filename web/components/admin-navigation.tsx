"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminSections } from "@/components/admin/admin-sections";

/** Overview is the only section whose path prefixes every other one, so it has
 *  to match exactly or it would stay highlighted everywhere. */
function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname() ?? "";

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh border-r border-outline bg-surface px-5 py-6 lg:block print:hidden">
        <div className="border-b border-outline px-3 pb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Operations</p>
          <p className="mt-1 text-sm text-on-surface-soft">System administration</p>
        </div>
        <nav className="mt-5 grid gap-1" aria-label="System administration navigation">
          {adminSections.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${current ? "bg-primary-softer text-primary" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 rounded-md border border-primary/20 bg-primary-softer p-3 text-xs leading-relaxed text-on-surface-soft">
          Financial records are intentionally unavailable to system administrators.
        </div>
      </aside>

      <nav
        className="sticky top-0 z-20 overflow-x-auto border-b border-outline bg-surface/95 px-4 py-2 backdrop-blur lg:hidden print:hidden"
        aria-label="System administration navigation"
      >
        <div className="mx-auto flex min-w-max gap-2">
          {adminSections.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold ${current ? "bg-primary-softer text-primary" : "text-on-surface-soft hover:bg-surface-soft hover:text-on-surface"}`}
              >
                {item.shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
