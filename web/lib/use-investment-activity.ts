"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import type { InvestingScope, InvestmentActivity } from "@/lib/investing-habit";

/**
 * The investing record behind the habit cards and highlights.
 *
 * On most dashboards these are extras beside figures that still stand if this
 * request fails. Where a figure depends on it, `failed` tells a failure apart
 * from still loading, so a confident zero is never shown in its place.
 */
export function useInvestmentActivity() {
  const apiCall = useApiCall();
  const [activity, setActivity] = useState<InvestmentActivity | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let ignore = false;
    void apiCall<InvestmentActivity>("/v1/investments/activity")
      .then((result) => {
        if (ignore) return;
        setActivity(result ?? null);
        setFailed(false);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [apiCall, nonce]);

  const setTargets = useCallback((targets: Partial<Record<InvestingScope, number>>) => {
    setActivity((current) => (current ? { ...current, targets } : current));
  }, []);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { activity, failed, setTargets, reload };
}
