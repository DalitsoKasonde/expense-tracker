"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { primeUserCurrency } from "@/lib/use-user-currency";
import { getApiBaseUrl } from "@/lib/client-api";
import { applyTheme } from "@/lib/theme";

type UserPreferences = {
  theme: "light" | "dark";
};

export { applyTheme };

/**
 * Reconciles the locally applied theme with the account preference.
 *
 * The pre-paint script in the root layout has already applied a theme, so this
 * only corrects it when the server disagrees. A failed request keeps whatever
 * is on screen instead of snapping back to light.
 */
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
        // Offline or API down: keep the theme already painted.
      }
    };

    void fetchTheme();

    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  return null;
}
