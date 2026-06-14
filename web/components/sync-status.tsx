"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function SyncStatus() {
  const { data: session } = useSession();
  const [synced, setSynced] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!session?.accessToken) return;

    const checkSync = async () => {
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
          const json = await response.json();
          setSynced(json.synced);
          setPending(json.pending || 0);
        }
      } catch {
        setSynced(false);
      }
    };

    checkSync();
    const interval = setInterval(checkSync, 5000);
    return () => clearInterval(interval);
  }, [session?.accessToken]);

  if (synced && pending === 0) return null;

  return (
    <div
      className="syncStatus"
      style={{
        backgroundColor: synced ? "#fbbf24" : "#ef4444",
      }}
    >
      {synced ? `${pending} pending...` : "Offline - will sync when connected"}
    </div>
  );
}
