"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { primeUserCurrency } from "@/lib/use-user-currency";
import { getApiBaseUrl } from "@/lib/client-api";

type UserPreferences = {
  theme: "light" | "dark";
};

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function PreferenceThemeSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.accessToken) return;

    let cancelled = false;

    const fetchTheme = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/v1/user/preferences`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          credentials: "include",
        });
        if (response.ok) {
          const prefs = (await response.json()) as UserPreferences & { defaultCurrency?: string };
          if (!cancelled) {
            primeUserCurrency(prefs.defaultCurrency);
            applyTheme(prefs.theme);
          }
        }
      } catch {
        if (!cancelled) {
          applyTheme("light");
        }
      }
    };

    void fetchTheme();

    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  return null;
}
