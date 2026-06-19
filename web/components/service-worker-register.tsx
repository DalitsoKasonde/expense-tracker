"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort registration
      });
    } else {
      // In development, aggressively unregister ALL service workers
      // and clear their caches to prevent stale-while-revalidate loops
      // that flood the dev server with continuous page requests.
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for (const registration of registrations) {
          const unregistered = await registration.unregister();
          if (unregistered) {
            console.log("[dev] Service Worker unregistered.");
          }
        }

        // Also clear any SW caches that might cause stale responses
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
            console.log(`[dev] Cleared SW cache: ${name}`);
          }
        }
      }).catch((err) => {
        console.warn("[dev] Failed to clean up service workers:", err);
      });
    }
  }, []);

  return null;
}
