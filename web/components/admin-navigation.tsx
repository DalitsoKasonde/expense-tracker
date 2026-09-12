"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminSections } from "@/components/admin/admin-sections";
import { useCallback, useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import type { FeedbackItem } from "@/components/admin/admin-data";
import {
  AddIcon,
  DashboardIcon,
  FeedbackIcon,
  HistoryIcon,
  ReportsIcon,
  SettingsIcon,
  TransactionsIcon,
} from "@/components/nav-icons";

const adminSectionIcons: Record<string, typeof DashboardIcon> = {
  "/admin": DashboardIcon,
  "/admin/users": TransactionsIcon,
  "/admin/invitations": AddIcon,
  "/admin/feedback": FeedbackIcon,
  "/admin/backups": HistoryIcon,
  "/admin/administrators": SettingsIcon,
  "/admin/audit": ReportsIcon,
};

/** Overview is the only section whose path prefixes every other one, so it has
 *  to match exactly or it would stay highlighted everywhere. */
function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname() ?? "";
  const apiCall = useApiCall();
  const [unreadFeedback, setUnreadFeedback] = useState(0);

  const loadUnreadFeedback = useCallback(() => {
    void apiCall<FeedbackItem[]>("/v1/admin/feedback")
      .then((items) => setUnreadFeedback((items ?? []).filter((item) => item.status === "new").length))
      .catch(() => setUnreadFeedback(0));
  }, [apiCall]);

  useEffect(() => {
    loadUnreadFeedback();
    window.addEventListener("admin-feedback-updated", loadUnreadFeedback);
    return () => window.removeEventListener("admin-feedback-updated", loadUnreadFeedback);
  }, [loadUnreadFeedback]);

  function label(item: (typeof adminSections)[number], mobile = false) {
    const Icon = adminSectionIcons[item.href];
    return (
      <>
        <span className="adminNavLabel">
          <span className="adminNavIcon" aria-hidden="true"><Icon /></span>
          <span>{mobile ? item.shortLabel : item.label}</span>
        </span>
        {item.href === "/admin/feedback" && unreadFeedback > 0 ? (
          <span className="adminNavCount" aria-label={`${unreadFeedback} unread feedback ${unreadFeedback === 1 ? "note" : "notes"}`}>
            {unreadFeedback}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <aside className="adminSidebar print:hidden">
        <div className="adminSidebarInner">
          <div className="adminNavIntro">
            <p>Operations</p>
            <span>System administration</span>
          </div>
          <nav className="adminNav" aria-label="System administration navigation">
            {adminSections.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`adminNavLink${current ? " is-active" : ""}`}
                >
                  {label(item)}
                </Link>
              );
            })}
          </nav>
          <div className="adminSidebarNote">
            Financial records are intentionally unavailable to system administrators.
          </div>
        </div>
      </aside>

      <nav
        className="adminMobileNav print:hidden"
        aria-label="System administration navigation"
      >
        <div className="adminMobileNavInner">
          {adminSections.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`adminNavLink${current ? " is-active" : ""}`}
              >
                {label(item, true)}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
