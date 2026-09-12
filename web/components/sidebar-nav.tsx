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
  const userName = session?.user?.name || "User";
  const avatarInitial = (userName.trim()[0] || session?.user?.email?.trim()[0] || "U").toUpperCase();

  return (
    <aside className="appSidebar print:hidden" aria-label="Primary navigation">
      <div className="appSidebarBrand">
        <Brand compact priority />
      </div>

      {/* Adding an entry is the one thing here that is not a place to go, so it
          sits above the list as a filled action rather than a fourth link. */}
      <div className="appSidebarAction">
        <AddEntryButton className="btn btn-primary appAddEntryButton">
          <span className="appAddEntryIcon" aria-hidden="true">
            <AddActionIcon />
          </span>
          {addNavigationItem.label}
        </AddEntryButton>
      </div>

      <nav className="appSidebarNav">
        {sidebarNavigation.map((item) => {
          const isActive = isNavigationItemActive(currentPath, item);
          const Icon = item.icon;
          const navClassName = `appSidebarLink${isActive ? " is-active" : ""}`;
          const iconClassName = "appSidebarIcon";

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
        <div className="appUserBlock">
          <div className="appUserIdentity">
            <span className="appUserAvatar" aria-hidden="true">{avatarInitial}</span>
            <span className="appUserCopy">
              <strong>{userName}</strong>
              <span>{session.user.email}</span>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary appSignOutButton"
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
