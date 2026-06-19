"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { getPendingTransactions, deletePendingTransaction } from "@/lib/offline-db";

export function SyncStatus() {
  const { data: session } = useSession();
  const [synced, setSynced] = useState(true);
  const [localPending, setLocalPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgress = useRef(false);

  useEffect(() => {
    if (!session?.accessToken) return;

    const checkAndSync = async () => {
      // 1. Check offline items
      const pendingItems = await getPendingTransactions();
      setLocalPending(pendingItems.length);

      // 2. Check connection status
      let online = false;
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/sync/status`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
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
          for (const item of pendingItems) {
            const uploadResponse = await fetch(
              `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/transactions`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify(item.payload),
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

    checkAndSync();
    const interval = setInterval(checkAndSync, 5000);
    return () => clearInterval(interval);
  }, [session?.accessToken]);

  if (synced && localPending === 0) return null;

  let message = "";
  let bgColor = "#ef4444"; // Red for offline

  if (!synced) {
    message = localPending > 0
      ? `Offline - ${localPending} entries queued`
      : "Offline - offline changes will sync when connected";
  } else if (isSyncing) {
    message = `Syncing ${localPending} pending entries...`;
    bgColor = "#fbbf24"; // Yellow/orange for active sync
  } else if (localPending > 0) {
    message = `${localPending} entries pending sync`;
    bgColor = "#fbbf24";
  }

  return (
    <div
      className="syncStatus"
      style={{
        backgroundColor: bgColor,
      }}
    >
      {message}
    </div>
  );
}

