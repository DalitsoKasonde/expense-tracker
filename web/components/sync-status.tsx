"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { getPendingTransactions, deletePendingTransaction } from "@/lib/offline-db";
import { getApiBaseUrl } from "@/lib/client-api";

export function SyncStatus() {
  const { data: session } = useSession();
  const [synced, setSynced] = useState(true);
  const [localPending, setLocalPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgress = useRef(false);

  useEffect(() => {
    if (!session?.accessToken) return;

    const checkAndSync = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      // 1. Check offline items
      const pendingItems = await getPendingTransactions();
      setLocalPending(pendingItems.length);

      // 2. Check connection status
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSynced(false);
        return;
      }

      let online = false;
      try {
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(
          `${apiBaseUrl}/v1/sync/status`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
            credentials: "include",
          }
        );
        if (response.ok) {
          online = true;
          setSynced(true);
        }
      } catch {
        setSynced(false);
      }

      // 3. Perform background synchronization if online and not already syncing
      if (online && pendingItems.length > 0 && !syncInProgress.current) {
        syncInProgress.current = true;
        setIsSyncing(true);
        try {
          const apiBaseUrl = getApiBaseUrl();
          for (const item of pendingItems) {
            const uploadResponse = await fetch(
              `${apiBaseUrl}/v1/transactions`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify(item.payload),
                credentials: "include",
              }
            );

            if (uploadResponse.ok) {
              await deletePendingTransaction(item.id);
            } else if (uploadResponse.status >= 400 && uploadResponse.status < 500) {
              // If it's a client error (e.g. invalid category or business link validation),
              // discard it to prevent blocking the queue forever.
              await deletePendingTransaction(item.id);
            } else {
              // Server error or timeout: break and retry later
              break;
            }
          }
        } catch (err) {
          console.error("Sync upload error:", err);
        } finally {
          const remaining = await getPendingTransactions();
          setLocalPending(remaining.length);
          setIsSyncing(false);
          syncInProgress.current = false;
        }
      }
    };

    void checkAndSync();
    const interval = window.setInterval(() => {
      void checkAndSync();
    }, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkAndSync();
      }
    };
    const handleReconnect = () => {
      void checkAndSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleReconnect);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleReconnect);
    };
  }, [session?.accessToken]);

  if (synced && localPending === 0) return null;

  let message = "";
  let tone = "border-negative/30 bg-negative-soft text-negative";

  if (!synced) {
    message = localPending > 0
      ? `Offline - ${localPending} entries queued`
      : "Offline - offline changes will sync when connected";
  } else if (isSyncing) {
    message = `Syncing ${localPending} pending entries...`;
    tone = "border-warning/30 bg-warning-soft text-warning";
  } else if (localPending > 0) {
    message = `${localPending} entries pending sync`;
    tone = "border-warning/30 bg-warning-soft text-warning";
  }

  return (
    <div role="status" className={`fixed right-4 top-4 z-50 rounded-md border px-4 py-2 text-sm font-semibold shadow-md ${tone}`}>
      {message}
    </div>
  );
}
