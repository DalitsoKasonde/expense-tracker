"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useApiCall } from "./client-api";

export type UserPreferences = {
  defaultCurrency?: string;
};

const FALLBACK_CURRENCY = "ZMW";

let cachedCurrency: string | null = null;
let currencyRequest: Promise<string> | null = null;

function normalizeCurrency(value?: string | null) {
  return value || FALLBACK_CURRENCY;
}

export function primeUserCurrency(currency?: string | null) {
  cachedCurrency = normalizeCurrency(currency);
}

async function resolveUserCurrency(fetcher: <T>(path: string) => Promise<T>) {
  if (cachedCurrency) {
    return cachedCurrency;
  }

  if (!currencyRequest) {
    currencyRequest = fetcher<UserPreferences>("/v1/user/preferences")
      .then((prefs) => {
        const nextCurrency = normalizeCurrency(prefs?.defaultCurrency);
        cachedCurrency = nextCurrency;
        return nextCurrency;
      })
      .catch(() => {
        cachedCurrency = FALLBACK_CURRENCY;
        return FALLBACK_CURRENCY;
      })
      .finally(() => {
        currencyRequest = null;
      });
  }

  return currencyRequest;
}

export function useUserCurrency() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const [currency, setCurrency] = useState(() => cachedCurrency ?? FALLBACK_CURRENCY);
  const [loading, setLoading] = useState(!cachedCurrency);

  useEffect(() => {
    if (!session?.accessToken) {
      setCurrency(FALLBACK_CURRENCY);
      setLoading(false);
      return;
    }

    let ignore = false;
    void resolveUserCurrency(apiCallRef.current).then((nextCurrency) => {
      if (!ignore) {
        setCurrency(nextCurrency);
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [session?.accessToken]);

  return { currency, loading };
}
