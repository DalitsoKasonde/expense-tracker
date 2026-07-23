"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon, SettingsIcon } from "./nav-icons";
import { useApiCall } from "@/lib/client-api";
import { signOutEverywhere } from "@/lib/browser-auth";

type TopNavProps = {
  initials: string;
  email?: string | null;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning";
  href: Route;
  createdAt: string;
};

type NotificationsResponse = {
  notificationsEnabled: boolean;
  items: NotificationItem[];
};

export function TopNav({ initials, email }: TopNavProps) {
  const apiCall = useApiCall();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(() => {
    setNotificationsLoading(true);
    setNotificationsError("");
    void apiCall<NotificationsResponse>("/v1/notifications")
      .then((result) => {
        setNotificationsEnabled(result?.notificationsEnabled ?? false);
        setNotificationItems(result?.items ?? []);
        setNotificationsError("");
      })
      .catch((error) => {
        setNotificationsEnabled(null);
        setNotificationItems([]);
        setNotificationsError("We couldn't load notifications.");
        console.error("Notification request failed", error);
      })
      .finally(() => setNotificationsLoading(false));
  }, [apiCall]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-outline bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-app items-center justify-end gap-3 px-4 py-3 sm:px-8 lg:px-12">
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-outline bg-surface text-on-surface-soft transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen((current) => !current);
              setProfileOpen(false);
            }}
          >
            <BellIcon className="size-5" />
          </button>
          {notificationsOpen ? (
            <div className="absolute right-0 top-12 z-30 grid w-72 gap-3 rounded-lg border border-outline bg-surface p-4 shadow-lg">
              <div className="grid gap-1">
                <strong className="text-sm text-on-surface">Notifications</strong>
                {notificationsError ? (
                  <div className="grid gap-2">
                    <span className="text-sm text-on-surface-soft">{notificationsError}</span>
                    <button
                      type="button"
                      className="ghostButton justify-center"
                      disabled={notificationsLoading}
                      onClick={loadNotifications}
                    >
                      {notificationsLoading ? "Trying again..." : "Try again"}
                    </button>
                  </div>
                ) : null}
                {!notificationsError && notificationsLoading ? <span className="text-sm text-on-surface-soft">Loading notifications...</span> : null}
                {!notificationsError && notificationsEnabled === false ? <span className="text-sm text-on-surface-soft">Notifications are off. Turn them on in Preferences if you want alerts here.</span> : null}
              </div>
              {notificationsEnabled ? (
                notificationItems.length ? (
                  <div className="grid gap-2">
                    {notificationItems.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`grid gap-1 rounded-md border px-3 py-2 transition-colors hover:bg-surface-soft ${item.level === "warning" ? "border-negative/30 bg-negative-soft/40" : "border-outline bg-surface"}`}
                        onClick={() => setNotificationsOpen(false)}
                      >
                        <strong className="text-sm text-on-surface">{item.title}</strong>
                        <span className="text-sm text-on-surface-soft">{item.body}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-on-surface-soft">No active notifications right now.</span>
                )
              ) : null}
              <Link
                href="/settings/preferences"
                className="ghostButton justify-center"
                onClick={() => setNotificationsOpen(false)}
              >
                Open preferences
              </Link>
            </div>
          ) : null}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={email ?? "Profile"}
            aria-expanded={profileOpen}
            title={email ?? "Profile"}
            onClick={() => {
              setProfileOpen((current) => !current);
              setNotificationsOpen(false);
            }}
          >
            {initials}
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-12 z-30 grid min-w-52 gap-3 rounded-lg border border-outline bg-surface p-4 shadow-lg">
              <div className="grid gap-1">
                <strong className="text-sm text-on-surface">{email ?? "Signed in"}</strong>
                <span className="text-sm text-on-surface-soft">Account menu</span>
              </div>
              <Link
                href="/settings/preferences"
                className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-on-surface-soft transition-colors hover:bg-surface-soft hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setProfileOpen(false)}
              >
                <SettingsIcon className="size-4" />
                <span>Settings</span>
              </Link>
              <button
                type="button"
                className="ghostButton justify-center"
                onClick={() => {
                  void signOutEverywhere();
                }}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
