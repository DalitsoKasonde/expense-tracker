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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        padding: "0.5rem 1rem",
        backgroundColor: synced ? "#fbbf24" : "#ef4444",
        color: "white",
        textAlign: "center",
        fontSize: "0.9rem",
        zIndex: 100,
      }}
    >
      {synced ? `${pending} pending...` : "Offline - will sync when connected"}
    </div>
  );
}
